import { useCallback, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'
import { readDroppedFile, generateTabId } from '../../utils/fileReader'
import { getFileName, generateFileId, extractHeadings } from '../../utils/markdown'
import type { EditorGroup as EditorGroupType } from '../../types'
import { GroupTabs } from './GroupTabs'
import { GroupContent } from './GroupContent'

type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'center' | null

interface EditorGroupProps {
  group: EditorGroupType
}

function computeZone(e: React.DragEvent<HTMLDivElement>): Exclude<DropZone, null> {
  const rect = e.currentTarget.getBoundingClientRect()
  const xPct = ((e.clientX - rect.left) / rect.width) * 100
  const yPct = ((e.clientY - rect.top) / rect.height) * 100

  if (xPct < 20) return 'left'
  if (xPct > 80) return 'right'
  if (yPct < 20) return 'top'
  if (yPct > 80) return 'bottom'
  return 'center'
}

function zoneToDirection(zone: string): 'horizontal' | 'vertical' {
  return zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical'
}

export function EditorGroup({ group }: EditorGroupProps) {
  const { state, dispatch } = useAppContext()
  const { readFile, isElectron } = useElectronAPI()
  const isActive = state.activeGroupId === group.id

  const [dropZone, setDropZone] = useState<DropZone>(null)

  const handleFocus = useCallback(() => {
    if (!isActive) {
      dispatch({ type: 'SET_ACTIVE_GROUP', payload: { groupId: group.id } })
    }
  }, [group.id, isActive, dispatch])

  // Get the active tab
  const activeTab = group.tabs.length > 0 && group.activeTabIndex >= 0
    ? group.tabs[group.activeTabIndex]
    : null

  // ---- Drag handlers ----

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDropZone(computeZone(e))
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only clear if leaving the group container (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropZone(null)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const zone = computeZone(e)
    setDropZone(null)

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

        const tabId = generateTabId()

        if (zone === 'center') {
          // Normal open in this group
          dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId, groupId: group.id } })
        } else {
          // Edge zone: open file then split
          const direction = zoneToDirection(zone)
          dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId, groupId: group.id } })
          dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, direction, tabId } })
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
          content: result.content,
          fileSize: result.size,
          lastModified: result.lastModified,
          headings,
        }
        const tabId = generateTabId()

        if (zone === 'center') {
          dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId, groupId: group.id } })
        } else {
          const direction = zoneToDirection(zone)
          dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId, groupId: group.id } })
          dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, direction, tabId } })
        }
      } catch {
        dispatch({ type: 'SET_ERROR', payload: `Failed to open file: ${filePath}` })
      }
      return
    }

    // --- Case 3: Tab drag to edge → split (center-zone handled by GroupTabs) ---
    const tabId = e.dataTransfer.getData('text/tab-id')
    const fromGroupId = e.dataTransfer.getData('text/from-group-id')
    if (tabId && fromGroupId && zone !== 'center') {
      // Edge zone: move tab into this group, then split it into a new pane
      const direction = zoneToDirection(zone)
      dispatch({
        type: 'MOVE_TAB',
        payload: { tabId, fromGroupId, toGroupId: group.id, toIndex: group.tabs.length },
      })
      dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, direction, tabId } })
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
      <div className="flex items-stretch" style={{ height: '36px' }}>
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
