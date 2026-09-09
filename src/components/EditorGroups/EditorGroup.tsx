import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useLayoutContext, useUIDispatch } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'
import { readDroppedMarkdownFiles, generateTabId, openFileByPath } from '../../utils/fileReader'
import type { EditorGroup as EditorGroupType, SplitPosition } from '../../types'
import { X } from 'lucide-react'
import { GroupTabs } from './GroupTabs'
import { GroupContent } from './GroupContent'
import { IconButton } from '../shared/IconButton'
import { ErrorBoundary } from '../ErrorBoundary'

type DropZone = SplitPosition | 'center' | null

const TAB_BAR_HEIGHT = 40
const EDGE_PCT = 10

interface CachedRect {
  left: number
  top: number
  width: number
  height: number
}

// 使用缓存的 rect 计算 zone（拖动期间窗口不 resize，避免每 dragover 一次同步布局读）
function computeZone(e: React.DragEvent<HTMLDivElement>, rect: CachedRect): DropZone {
  const contentTop = rect.top + TAB_BAR_HEIGHT
  const contentHeight = rect.height - TAB_BAR_HEIGHT

  // Tab bar area — no edge detection
  if (e.clientY < contentTop) return 'center'

  const xPct = ((e.clientX - rect.left) / rect.width) * 100
  const yPct = ((e.clientY - contentTop) / contentHeight) * 100

  const distToLeft = xPct
  const distToRight = 100 - xPct
  const distToTop = yPct
  const distToBottom = 100 - yPct

  const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom)
  if (minDist > EDGE_PCT) return 'center'

  // Closest edge wins — no priority shadowing
  if (minDist === distToLeft) return 'left'
  if (minDist === distToRight) return 'right'
  if (minDist === distToTop) return 'top'
  return 'bottom'
}

interface EditorGroupProps {
  group: EditorGroupType
}

// memo：mapTree 保留未受影响 group 的对象引用 —— 其它分组的布局操作不会让本组重渲染
export const EditorGroup = memo(function EditorGroup({ group }: EditorGroupProps) {
  const { state: layoutState, dispatch: layoutDispatch } = useLayoutContext()
  const uiDispatch = useUIDispatch()
  const { readFile, isElectron } = useElectronAPI()
  const isActive = layoutState.activeGroupId === group.id

  const [dropZone, setDropZone] = useState<DropZone>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const rectRef = useRef<CachedRect | null>(null)

  // Clear highlight when drag ends
  useEffect(() => {
    const clear = () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
      setDropZone(null)
    }
    window.addEventListener('dragend', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  const handleFocus = useCallback(() => {
    if (!isActive) {
      layoutDispatch({ type: 'SET_ACTIVE_GROUP', payload: { groupId: group.id } })
    }
  }, [group.id, isActive, layoutDispatch])

  const activeTab = group.tabs.length > 0 && group.activeTabIndex >= 0
    ? group.tabs[group.activeTabIndex]
    : null

  // ---- Drag handlers ----

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // 拖动开始时读取一次 rect 并缓存（dragover 期间窗口不 resize）
    const r = e.currentTarget.getBoundingClientRect()
    rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = undefined
    }
    if (!rectRef.current) {
      const r = e.currentTarget.getBoundingClientRect()
      rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height }
    }
    setDropZone(computeZone(e, rectRef.current))
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      leaveTimerRef.current = setTimeout(() => setDropZone(null), 150)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const zone = computeZone(e, rectRef.current ?? { left: 0, top: 0, width: 1, height: 1 })
    rectRef.current = null
    setDropZone(null)

    // Hide global drag overlay
    uiDispatch({ type: 'SET_DRAG_OVER', payload: false })

    // Edge zone → use as split position directly
    const position: SplitPosition | null =
      zone === 'center' || zone === null ? null : zone

    // --- Case 1: External file drop (files in dataTransfer) ---
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // E7: shared drop pipeline (filter → read → 收集失败原因)
      const { opened, errors } = await readDroppedMarkdownFiles(Array.from(e.dataTransfer.files), readFile, isElectron)
      if (opened.length === 0) {
        // 与全局 drop 行为一致：拖入不支持的文件也要有反馈，而不是毫无反应
        uiDispatch({
          type: 'SET_ERROR',
          payload: errors.length > 0 ? errors[0] : 'No markdown file found in the dropped items.',
        })
        return
      }

      // Multi-file → open all in this group, no split regardless of zone
      if (opened.length > 1) {
        for (const openFile of opened) {
          layoutDispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: generateTabId(), groupId: group.id } })
        }
        return
      }

      // Single file → existing behavior
      const openFile = opened[0]
      if (!position) {
        layoutDispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: generateTabId(), groupId: group.id } })
      } else {
        layoutDispatch({
          type: 'OPEN_FILE_AND_SPLIT',
          payload: { file: openFile, tabId: generateTabId(), groupId: group.id, position },
        })
      }
      return
    }

    // --- Case 2: File tree drag (custom data) ---
    const filePath = e.dataTransfer.getData('text/file-path')
    if (filePath) {
      try {
        // E6: shared path→OpenFile flow
        const openFile = await openFileByPath(filePath, readFile)
        const tabId = generateTabId()

        if (!position) {
          layoutDispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId, groupId: group.id } })
        } else {
          layoutDispatch({
            type: 'OPEN_FILE_AND_SPLIT',
            payload: { file: openFile, tabId, groupId: group.id, position },
          })
        }
      } catch {
        uiDispatch({ type: 'SET_ERROR', payload: `Failed to open file: ${filePath}` })
      }
      return
    }

    // --- Case 3: Tab drag (tab-id + from-group-id) ---
    const tabId = e.dataTransfer.getData('text/tab-id')
    const fromGroupId = e.dataTransfer.getData('text/from-group-id')
    if (tabId && fromGroupId) {
      if (!position) {
        layoutDispatch({
          type: 'MOVE_TAB',
          payload: { tabId, fromGroupId, toGroupId: group.id, toIndex: group.tabs.length },
        })
      } else {
        layoutDispatch({
          type: 'SPLIT_WITH_TAB',
          payload: { tabId, fromGroupId, toGroupId: group.id, position },
        })
      }
    }
  }, [group.id, group.tabs.length, layoutDispatch, readFile, isElectron])

  // ---- Render ----

  return (
    <div
      className="h-full flex flex-col relative"
      data-active-group={isActive ? 'true' : 'false'}
      onClick={handleFocus}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Tab Bar */}
      <div className="flex items-stretch" style={{ height: TAB_BAR_HEIGHT }}>
        <div className="flex-1 min-w-0">
          <GroupTabs group={group} isActive={isActive} />
        </div>
        <IconButton
          icon={X}
          title="Close Group"
          size="lg"
          onClick={() => layoutDispatch({ type: 'CLOSE_GROUP', payload: { groupId: group.id } })}
          className="flex-shrink-0 w-9 h-full rounded-none rounded-r-lg bg-chrome-subtle border-b border-chrome-border"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-chrome-surface">
        {activeTab ? (
          // 单个面板出错不应带走整个应用 —— 其余面板保持可用
          <ErrorBoundary key={activeTab.id}>
            <GroupContent tab={activeTab} />
          </ErrorBoundary>
        ) : (
          <div className="h-full flex items-center justify-center text-chrome-text-faint text-sm">
            <div className="text-center">
              <p className="text-lg mb-2">No file open</p>
              <p className="text-xs">Open a file from the Explorer or drop a file here</p>
            </div>
          </div>
        )}
      </div>

      {/* Edge drop zone highlight */}
      {dropZone && dropZone !== 'center' && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div
            className={`
              absolute bg-blue-500/20 border-2 border-blue-400
              ${dropZone === 'left'   ? 'left-0 top-0 bottom-0 w-[20%] rounded-l-lg' : ''}
              ${dropZone === 'right'  ? 'right-0 top-0 bottom-0 w-[20%] rounded-r-lg' : ''}
              ${dropZone === 'top'    ? 'top-0 left-0 right-0 h-[20%] rounded-t-lg' : ''}
              ${dropZone === 'bottom' ? 'bottom-0 left-0 right-0 h-[20%] rounded-b-lg' : ''}
            `}
          />
        </div>
      )}
    </div>
  )
})
