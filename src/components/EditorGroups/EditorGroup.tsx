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
    </div>
  )
}
