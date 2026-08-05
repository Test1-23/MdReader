import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import type { EditorGroup as EditorGroupType } from '../../types'
import { GroupTab } from './GroupTab'

interface GroupTabsProps {
  group: EditorGroupType
  isActive: boolean
}

export function GroupTabs({ group, isActive }: GroupTabsProps) {
  const { state, dispatch } = useAppContext()
  const tabBarRef = useRef<HTMLDivElement>(null)

  const handleTabClick = useCallback(
    (tabId: string) => {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: { groupId: group.id, tabId: tabId } })
    },
    [group.id, dispatch]
  )

  const handleTabClose = useCallback(
    (tabId: string) => {
      dispatch({ type: 'CLOSE_TAB', payload: { groupId: group.id, tabId: tabId } })
    },
    [group.id, dispatch]
  )

  // Context menu state (React-based, no DOM leaks)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, tabId })
    },
    []
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const tabId = e.dataTransfer.getData('text/tab-id')
      const fromGroupId = e.dataTransfer.getData('text/from-group-id')

      if (!tabId || !fromGroupId) return

      // Read tab positions once outside the loop (avoid layout thrashing)
      const tabChildren = Array.from(tabBarRef.current?.children ?? [])
        .slice(0, group.tabs.length)
      const tabMidpoints = tabChildren.map((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect()
        return rect.left + rect.width / 2
      })

      const foundIdx = tabMidpoints.findIndex((midX) => e.clientX < midX)
      const dropIndex = foundIdx >= 0 ? foundIdx : group.tabs.length

      dispatch({
        type: 'MOVE_TAB',
        payload: {
          tabId,
          fromGroupId,
          toGroupId: group.id,
          toIndex: dropIndex,
        },
      })
    },
    [group.id, group.tabs.length, dispatch]
  )

  return (
    <div
      ref={tabBarRef}
      className={`
        flex items-end overflow-x-auto bg-gray-200 border-b border-gray-300
        ${isActive ? '' : 'opacity-90'}
      `}
      style={{ height: '36px' }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {group.tabs.map((tab) => (
        <GroupTab
          key={tab.id}
          tab={tab}
          groupId={group.id}
          isActive={tab.id === state.activeTabId}
          onClick={() => handleTabClick(tab.id)}
          onClose={() => handleTabClose(tab.id)}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
        />
      ))}

      {/* Spacer to fill the rest */}
      <div className="flex-1 h-full" />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-300 rounded shadow-lg py-1 z-50 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className="px-4 py-1 hover:bg-blue-500 hover:text-white cursor-pointer"
            onClick={() => {
              dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, direction: 'vertical' } })
              setContextMenu(null)
            }}
          >
            Split Right
          </div>
          <div
            className="px-4 py-1 hover:bg-blue-500 hover:text-white cursor-pointer"
            onClick={() => {
              dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, direction: 'horizontal' } })
              setContextMenu(null)
            }}
          >
            Split Down
          </div>
          <div className="border-t border-gray-200 my-1" />
          <div
            className="px-4 py-1 hover:bg-blue-500 hover:text-white cursor-pointer"
            onClick={() => {
              handleTabClose(contextMenu.tabId)
              setContextMenu(null)
            }}
          >
            Close
          </div>
        </div>
      )}
    </div>
  )
}
