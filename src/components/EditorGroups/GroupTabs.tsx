import { useCallback, useRef } from 'react'
import { useAppContext } from '../../context/AppContext'
import { findGroup } from '../../utils/layout'
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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault()
      // Simple context menu: split options
      const menuItems = [
        {
          label: 'Split Right',
          action: () => dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, direction: 'vertical' } }),
        },
        {
          label: 'Split Down',
          action: () => dispatch({ type: 'SPLIT_GROUP', payload: { groupId: group.id, direction: 'horizontal' } }),
        },
        { type: 'separator' as const },
        {
          label: 'Close',
          action: () => handleTabClose(tabId),
        },
      ]

      // Create a simple context menu
      const menu = document.createElement('div')
      menu.className = 'fixed bg-white border border-gray-300 rounded shadow-lg py-1 z-50 text-sm'
      menu.style.left = `${e.clientX}px`
      menu.style.top = `${e.clientY}px`

      menuItems.forEach((item) => {
        if ('type' in item && item.type === 'separator') {
          const sep = document.createElement('div')
          sep.className = 'border-t border-gray-200 my-1'
          menu.appendChild(sep)
        } else if ('label' in item) {
          const menuItem = document.createElement('div')
          menuItem.className = 'px-4 py-1 hover:bg-blue-500 hover:text-white cursor-pointer'
          menuItem.textContent = item.label
          menuItem.onclick = () => {
            item.action()
            menu.remove()
          }
          menu.appendChild(menuItem)
        }
      })

      document.body.appendChild(menu)

      // Remove menu on click outside
      const removeMenu = () => {
        menu.remove()
        document.removeEventListener('click', removeMenu)
      }
      setTimeout(() => document.addEventListener('click', removeMenu), 0)
    },
    [group.id, dispatch, handleTabClose]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      // Handle tab drop for reorder/move
      const tabId = e.dataTransfer.getData('text/tab-id')
      const fromGroupId = e.dataTransfer.getData('text/from-group-id')

      if (tabId && fromGroupId && fromGroupId !== group.id) {
        // Move tab from another group
        const dropIndex = group.tabs.length > 0
          ? Math.min(
              group.tabs.findIndex(
                (_, i) => {
                  const tabEl = tabBarRef.current?.children[i] as HTMLElement
                  return tabEl && e.clientX < tabEl.getBoundingClientRect().left + tabEl.offsetWidth / 2
                }
              ),
              group.tabs.length
            )
          : 0

        dispatch({
          type: 'MOVE_TAB',
          payload: {
            tabId,
            fromGroupId,
            toGroupId: group.id,
            toIndex: dropIndex >= 0 ? dropIndex : group.tabs.length,
          },
        })
      }
    },
    [group.id, group.tabs, dispatch]
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
    </div>
  )
}
