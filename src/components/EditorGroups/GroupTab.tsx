import { memo } from 'react'
import type { TabEntry } from '../../types'
import { AI_WINDOW_ID } from '../../utils/windowDescriptor'
import { MessageSquare, Eye, FileCode2, X } from 'lucide-react'
import { useLayoutDispatch } from '../../context/AppContext'
import { IconButton } from '../shared/IconButton'

interface GroupTabProps {
  tab: TabEntry
  groupId: string
  isActive: boolean
  /** 稳定引用（GroupTabs 用 useCallback([]) 提供）—— memo 才能生效 */
  onContextMenu: (e: React.MouseEvent, tabId: string) => void
}

// dispatch 内移 + memo：mapTree 保留未受影响 tab 的对象引用，因此其它 tab 的
// 增删/切换不会让存活 tab 重渲染
export const GroupTab = memo(function GroupTab({ tab, groupId, isActive, onContextMenu }: GroupTabProps) {
  const dispatch = useLayoutDispatch()

  return (
    <div
      draggable
      data-tab-id={tab.id}
      data-tab-active={isActive ? 'true' : undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/tab-id', tab.id)
        e.dataTransfer.setData('text/from-group-id', groupId)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: { groupId, tabId: tab.id } })}
      onContextMenu={(e) => onContextMenu(e, tab.id)}
      className={`
        group flex items-center gap-1.5 px-3 py-2 text-[13px] cursor-pointer select-none
        border-r border-chrome-border min-w-0 max-w-[200px] rounded-t-lg mx-0.5 mt-1.5
        transition-colors duration-75
        ${isActive
          ? 'bg-chrome-surface text-chrome-text shadow-sm border-t-2 border-t-blue-500'
          : 'bg-chrome-subtle text-chrome-text-muted hover:bg-chrome-hover'
        }
      `}
      title={tab.filePath || tab.fileName}
    >
      {/* Tab icon */}
      {tab.fileId === AI_WINDOW_ID
        ? <MessageSquare size={14} className="flex-shrink-0 text-chrome-text-faint" />
        : tab.viewMode === 'preview'
          ? <Eye size={14} className="flex-shrink-0 text-chrome-text-faint" />
          : <FileCode2 size={14} className="flex-shrink-0 text-chrome-text-faint" />}

      {/* File name */}
      <span className="truncate flex-1">{tab.fileName}</span>

      {/* Modified indicator (for pasted content) */}
      {!tab.filePath && (
        <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" title="Unsaved pasted content" />
      )}

      {/* Close button */}
      <IconButton
        icon={X}
        title="Close"
        size="sm"
        data-tab-close={tab.id}
        onClick={() => dispatch({ type: 'CLOSE_TAB', payload: { groupId, tabId: tab.id } })}
        className={`flex-shrink-0 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
      />
    </div>
  )
})
