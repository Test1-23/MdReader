import { useState } from 'react'
import { useAIContext } from '../../context/AppContext'
import type { Conversation } from '../../utils/conversationTree'

interface ConversationListProps {
  conv: Conversation | null
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onNew: () => void
}

export function ConversationList({ conv, onSelect, onRename, onDelete, onNew }: ConversationListProps) {
  const { state } = useAIContext()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const startRename = (id: string, title: string) => {
    setRenamingId(id)
    setRenameText(title)
  }

  const submitRename = (id: string) => {
    if (renameText.trim()) onRename(id, renameText.trim())
    setRenamingId(null)
  }

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 新建对话 */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={onNew}
          className="w-full px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
        >
          ✏️ 新建对话
        </button>
      </div>

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {state.conversationList.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-600">
            暂无已保存的对话
          </div>
        )}
        {state.conversationList.map((item) => {
          const isCurrent = conv?.id === item.id
          const isRenaming = renamingId === item.id
          const isConfirming = confirmDeleteId === item.id
          return (
            <div
              key={item.id}
              className={`
                group flex items-center gap-1 px-3 py-1.5 cursor-pointer transition-colors
                ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
              `}
              onClick={() => !isRenaming && !isConfirming && onSelect(item.id)}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(item.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => submitRename(item.id)}
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-xs border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                />
              ) : isConfirming ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">删除？</span>
                  <button
                    onClick={() => { onDelete(item.id); setConfirmDeleteId(null) }}
                    className="px-1.5 py-0.5 text-[10px] bg-red-500 hover:bg-red-600 text-white rounded"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-1.5 py-0.5 text-[10px] text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs truncate ${isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                      {item.title}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-600">
                      {formatTime(item.updatedAt)}
                    </div>
                  </div>
                  {/* hover 操作 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(item.id, item.title) }}
                    className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-blue-700 text-xs px-1"
                    title="重命名"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(item.id) }}
                    className="opacity-0 group-hover:opacity-100 text-blue-500 hover:text-red-500 text-xs px-1"
                    title="删除"
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
