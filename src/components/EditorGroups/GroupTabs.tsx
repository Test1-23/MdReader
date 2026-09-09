import { useCallback, useEffect, useState } from 'react'
import { useLayoutContext } from '../../context/AppContext'
import type { EditorGroup as EditorGroupType } from '../../types'
import { GroupTab } from './GroupTab'
import { MENU_ITEM } from '../shared/classes'

interface GroupTabsProps {
  group: EditorGroupType
  isActive: boolean
}

export function GroupTabs({ group, isActive }: GroupTabsProps) {
  const { state, dispatch } = useLayoutContext()

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

  return (
    <div
      className={`
        flex items-end overflow-x-auto bg-chrome-subtle border-b border-chrome-border h-full
        ${isActive ? '' : 'opacity-90'}
      `}
    >
      {group.tabs.map((tab) => (
        <GroupTab
          key={tab.id}
          tab={tab}
          groupId={group.id}
          isActive={tab.id === state.activeTabId}
          onContextMenu={handleContextMenu}
        />
      ))}

      {/* Spacer to fill the rest */}
      <div className="flex-1 h-full" />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-chrome-raised border border-chrome-border rounded-lg shadow-lg py-1 z-50 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div
            className={MENU_ITEM}
            onClick={() => {
              dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, position: 'right' } })
              setContextMenu(null)
            }}
          >
            Split Right
          </div>
          <div
            className={MENU_ITEM}
            onClick={() => {
              dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, position: 'bottom' } })
              setContextMenu(null)
            }}
          >
            Split Down
          </div>
          <div className="border-t border-gray-200 my-1" />
          <div
            className={MENU_ITEM}
            onClick={() => {
              dispatch({ type: 'CLOSE_TAB', payload: { groupId: group.id, tabId: contextMenu.tabId } })
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
