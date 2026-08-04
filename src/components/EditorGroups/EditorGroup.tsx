import { useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import type { EditorGroup as EditorGroupType } from '../../types'
import { GroupTabs } from './GroupTabs'
import { GroupContent } from './GroupContent'

interface EditorGroupProps {
  group: EditorGroupType
}

export function EditorGroup({ group }: EditorGroupProps) {
  const { state, dispatch } = useAppContext()
  const isActive = state.activeGroupId === group.id

  const handleFocus = useCallback(() => {
    if (!isActive) {
      dispatch({ type: 'SET_ACTIVE_GROUP', payload: { groupId: group.id } })
    }
  }, [group.id, isActive, dispatch])

  // Get the active tab
  const activeTab = group.tabs.length > 0 && group.activeTabIndex >= 0
    ? group.tabs[group.activeTabIndex]
    : null

  return (
    <div
      className={`h-full flex flex-col ${isActive ? '' : ''}`}
      onClick={handleFocus}
    >
      {/* Tab Bar */}
      <GroupTabs group={group} isActive={isActive} />

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
    </div>
  )
}
