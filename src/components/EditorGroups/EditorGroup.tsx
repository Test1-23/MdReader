import { useCallback, useEffect, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'
import { readDroppedFile, generateTabId } from '../../utils/fileReader'
import { getFileName, generateFileId, extractHeadings } from '../../utils/markdown'
import type { EditorGroup as EditorGroupType } from '../../types'
import { GroupTabs } from './GroupTabs'
import { GroupContent } from './GroupContent'

type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'center' | null
type EdgeZone = 'top' | 'bottom' | 'left' | 'right'

const TAB_BAR_HEIGHT = 36
const EDGE_PCT = 20

function computeZone(e: React.DragEvent<HTMLDivElement>): DropZone {
  const rect = e.currentTarget.getBoundingClientRect()
  const contentTop = rect.top + TAB_BAR_HEIGHT
  const contentHeight = rect.height - TAB_BAR_HEIGHT

  // Tab bar area — no edge detection (prevents double-fire with tab interactions)
  if (e.clientY < contentTop) return 'center'

  const xPct = ((e.clientX - rect.left) / rect.width) * 100
  const yPct = ((e.clientY - contentTop) / contentHeight) * 100

  if (xPct < EDGE_PCT) return 'left'
  if (xPct > 100 - EDGE_PCT) return 'right'
  if (yPct < EDGE_PCT) return 'top'
  if (yPct > 100 - EDGE_PCT) return 'bottom'
  return 'center'
}

function zoneToDirection(zone: EdgeZone): 'horizontal' | 'vertical' {
  return zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical'
}

interface EditorGroupProps {
  group: EditorGroupType
}

export function EditorGroup({ group }: EditorGroupProps) {
  const { state, dispatch } = useAppContext()
  const { readFile, isElectron } = useElectronAPI()
  const isActive = state.activeGroupId === group.id

  const [dropZone, setDropZone] = useState<DropZone>(null)

  // Clear highlight when drag ends (cancelled without drop)
  useEffect(() => {
    const clear = () => setDropZone(null)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const handleFocus = useCallback(() => {
    if (!isActive) {
      dispatch({ type: 'SET_ACTIVE_GROUP', payload: { groupId: group.id } })
    }
  }, [group.id, isActive, dispatch])

  const activeTab = group.tabs.length > 0 && group.activeTabIndex >= 0
    ? group.tabs[group.activeTabIndex]
    : null

  // ---- Drag handlers ----

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDropZone(computeZone(e))
  }, [])

  // Don't clear drop zone on leave — rely on dragover from parent/sibling to update.
  // The zone is cleared in handleDrop and on the next dragOver in a different group.
  // This prevents the highlight from disappearing when the mouse is at the very edge
  // of the element (especially left/top window boundaries).
  const handleDragLeave = useCallback((_e: React.DragEvent<HTMLDivElement>) => {
    // Intentionally no-op — zone persists until drop or next dragover
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const zone = computeZone(e)
    setDropZone(null)

    // Hide global drag overlay
    dispatch({ type: 'SET_DRAG_OVER', payload: false })

    // --- Case 1: External file drop (files in dataTransfer) ---
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = Array.from(e.dataTransfer.files).find((f) => {
        const n = f.name.toLowerCase()
        return n.endsWith('.md') || n.endsWith('.markdown') || n.endsWith('.mdown') || n.endsWith('.mkd') || n.endsWith('.txt')
      })
      if (!file) return

      try {
        const openFile = await readDroppedFile(file, readFile, isElectron)
        if (!openFile) return

        if (zone === 'center') {
          dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: generateTabId(), groupId: group.id } })
        } else {
          const direction = zoneToDirection(zone as EdgeZone)
          dispatch({
            type: 'OPEN_FILE_AND_SPLIT',
            payload: { file: openFile, tabId: generateTabId(), groupId: group.id, direction, newGroupFirst: zone === 'left' || zone === 'top' },
          })
        }
      } catch {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to read the dropped file.' })
      }
      return
    }

    // --- Case 2: File tree drag (custom data) ---
    const filePath = e.dataTransfer.getData('text/file-path')
    if (filePath) {
      try {
        const result = await readFile(filePath)
        const fileName = getFileName(filePath)
        const fileId = generateFileId(filePath)
        const headings = extractHeadings(result.content)
        const openFile = {
          fileId, filePath, fileName,
          content: result.content, fileSize: result.size,
          lastModified: result.lastModified, headings,
        }
        const tabId = generateTabId()

        if (zone === 'center') {
          dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId, groupId: group.id } })
        } else {
          const direction = zoneToDirection(zone as EdgeZone)
          dispatch({
            type: 'OPEN_FILE_AND_SPLIT',
            payload: { file: openFile, tabId, groupId: group.id, direction, newGroupFirst: zone === 'left' || zone === 'top' },
          })
        }
      } catch {
        dispatch({ type: 'SET_ERROR', payload: `Failed to open file: ${filePath}` })
      }
      return
    }

    // --- Case 3: Tab drag (tab-id + from-group-id) — EditorGroup handles all tab drops ---
    const tabId = e.dataTransfer.getData('text/tab-id')
    const fromGroupId = e.dataTransfer.getData('text/from-group-id')
    if (tabId && fromGroupId) {
      if (zone === 'center') {
        // Center zone → normal tab move (replaces GroupTabs' old drop handler)
        dispatch({
          type: 'MOVE_TAB',
          payload: { tabId, fromGroupId, toGroupId: group.id, toIndex: group.tabs.length },
        })
      } else {
        // Edge zone → split with this tab
        const direction = zoneToDirection(zone as EdgeZone)
        dispatch({
          type: 'SPLIT_WITH_TAB',
          payload: { tabId, fromGroupId, toGroupId: group.id, direction, newGroupFirst: zone === 'left' || zone === 'top' },
        })
      }
    }
  }, [group.id, group.tabs.length, dispatch, readFile, isElectron])

  // ---- Render ----

  return (
    <div
      className={`h-full flex flex-col relative ${isActive ? '' : ''}`}
      onClick={handleFocus}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Tab Bar with group close button */}
      <div className="flex items-stretch" style={{ height: TAB_BAR_HEIGHT }}>
        <div className="flex-1 min-w-0">
          <GroupTabs group={group} isActive={isActive} />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            dispatch({ type: 'CLOSE_GROUP', payload: { groupId: group.id } })
          }}
          className="flex-shrink-0 w-7 flex items-center justify-center bg-gray-200 border-b border-gray-300 text-gray-400 hover:text-gray-700 hover:bg-gray-300 transition-colors text-sm"
          title="Close Group"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <GroupContent tab={activeTab} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            <div className="text-center">
              <p className="text-lg mb-2">No file open</p>
              <p className="text-xs">Open a file from the Explorer or drop a file here</p>
            </div>
          </div>
        )}
      </div>

      {/* VS Code-style edge drop zone highlight */}
      {dropZone && dropZone !== 'center' && (
        <div className="absolute inset-0 pointer-events-none z-10">
          <div
            className={`
              absolute bg-blue-500/20 border-2 border-blue-400
              ${dropZone === 'left'   ? 'left-0 top-0 bottom-0 w-[20%] rounded-l' : ''}
              ${dropZone === 'right'  ? 'right-0 top-0 bottom-0 w-[20%] rounded-r' : ''}
              ${dropZone === 'top'    ? 'top-0 left-0 right-0 h-[20%] rounded-t' : ''}
              ${dropZone === 'bottom' ? 'bottom-0 left-0 right-0 h-[20%] rounded-b' : ''}
            `}
          />
        </div>
      )}
    </div>
  )
}
