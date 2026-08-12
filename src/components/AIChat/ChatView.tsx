import { memo, useEffect, useRef, useState } from 'react'
import type { Conversation, ChatNode } from '../../utils/conversationTree'
import { getActivePath } from '../../utils/conversationTree'
import { ChatBubble } from './ChatBubble'

interface ChatViewProps {
  conv: Conversation
  activeNodeId: string | null
  loading: boolean
  onSwitchBranch: (nodeId: string) => void
  onCopy: (nodeId: string) => void
  onRegenerate: (nodeId: string) => void
  onEdit: (nodeId: string, newText: string) => void
}

// 找到 node 下不在活跃路径上的子节点（即分支点）
function getBranchEntries(conv: Conversation, nodeId: string, activePathIds: Set<string>): ChatNode[] {
  const node = conv.nodes[nodeId]
  if (!node) return []
  return node.childrenIds
    .map((id) => conv.nodes[id])
    .filter((child): child is ChatNode => !!child && !activePathIds.has(child.id))
}

export const ChatView = memo(function ChatView({ conv, activeNodeId, loading, onSwitchBranch, onCopy, onRegenerate, onEdit }: ChatViewProps) {
  const activePath = getActivePath(conv)
  const activePathIds = new Set(activePath.map((n) => n.id))
  const [editingId, setEditingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  // 距底 ≤100px 视为"在底部"（用户焦点在底部时跟随滚动）
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 100
  }

  // 消息变化（发送 / 流式增长）→ 若在底部则滚到底
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [conv])

  const handleEditStart = (nodeId: string) => {
    setEditingId(nodeId)
  }

  const handleEditCancel = () => {
    setEditingId(null)
  }

  const handleEditConfirm = (nodeId: string, newText: string) => {
    setEditingId(null)
    onEdit(nodeId, newText)
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2">
      {activePath.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-600">
          No messages yet. Select text in the document to start.
        </div>
      )}
      {activePath.map((node) => (
        <div key={node.id}>
          <ChatBubble
            node={node}
            isActive={node.id === activeNodeId}
            loading={loading}
            convId={conv.id}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onEdit={handleEditConfirm}
            onEditCancel={handleEditCancel}
            editing={editingId === node.id}
          />
          {/* 非活跃分支入口 */}
          {getBranchEntries(conv, node.id, activePathIds).map((branch) => (
            <button
              key={branch.id}
              onClick={() => onSwitchBranch(branch.id)}
              className="ml-8 my-0.5 px-2 py-0.5 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              ↪ 分支 {new Date(branch.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
})
