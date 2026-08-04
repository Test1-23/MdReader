import { useCallback } from 'react'
import type { TabEntry } from '../../types'

interface GroupTabProps {
  tab: TabEntry
  groupId: string
  isActive: boolean
  onClick: () => void
  onClose: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function GroupTab({ tab, groupId, isActive, onClick, onClose, onContextMenu }: GroupTabProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('text/tab-id', tab.id)
      e.dataTransfer.setData('text/from-group-id', groupId)
      e.dataTransfer.effectAllowed = 'move'
    },
    [tab.id, groupId]
  )

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`
        group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer select-none
        border-r border-gray-300 min-w-0 max-w-[200px]
        transition-colors duration-75
        ${isActive
          ? 'bg-white text-gray-800 border-t-2 border-t-blue-500'
          : 'bg-tab-inactive-bg text-gray-600 hover:bg-gray-100'
        }
      `}
      title={tab.filePath || tab.fileName}
    >
      {/* File icon */}
      <span className="text-sm flex-shrink-0">
        {tab.viewMode === 'preview' ? '📝' : '📋'}
      </span>

      {/* File name */}
      <span className="truncate flex-1">{tab.fileName}</span>

      {/* Modified indicator (for pasted content) */}
      {!tab.filePath && (
        <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" title="Unsaved pasted content" />
      )}

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className={`
          flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-sm
          text-gray-400 hover:text-gray-700 hover:bg-gray-300
          ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          transition-opacity
        `}
        title="Close"
      >
        ×
      </button>
    </div>
  )
}
