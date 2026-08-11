import type { Conversation, ChatNode } from '../../utils/conversationTree'

interface ChatTreeViewProps {
  conv: Conversation
  activeNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

// 找 node 后第一个 assistant 回复（构成 user+AI 对）
function findAssistantReply(conv: Conversation, node: ChatNode): ChatNode | null {
  for (const childId of node.childrenIds) {
    const child = conv.nodes[childId]
    if (child && child.role === 'assistant') return child
  }
  return null
}

export function ChatTreeView({ conv, activeNodeId, onSelectNode }: ChatTreeViewProps) {
  // 收集所有根节点（无父节点的 user 节点）
  const roots: ChatNode[] = Object.values(conv.nodes).filter(
    (n) => n.role === 'user' && (!n.parentId || !conv.nodes[n.parentId])
  )

  const renderNodePair = (node: ChatNode, depth: number): JSX.Element => {
    const assistant = findAssistantReply(conv, node)
    const isActive = node.id === activeNodeId
    // 子节点中 role=user 的节点（下一层的 pair 起点）
    const userChildren = node.childrenIds
      .map((id) => conv.nodes[id])
      .filter((c): c is ChatNode => !!c && c.role === 'user')

    return (
      <div key={node.id}>
        <button
          onClick={() => onSelectNode(node.id)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`
            w-full text-left py-1 pr-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors
            ${isActive ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500' : 'border-l-2 border-transparent'}
          `}
        >
          <div className="text-gray-700 dark:text-gray-300 truncate">
            <span className="mr-1 text-gray-400 dark:text-gray-500">👤</span>
            {node.content.slice(0, 40) || '(empty)'}
          </div>
          {assistant && (
            <div className="text-gray-400 dark:text-gray-500 truncate text-[10px] pl-4">
              <span className="mr-1">🤖</span>
              {assistant.content.slice(0, 40)}
            </div>
          )}
        </button>
        {/* 递归所有子分支（user 节点） */}
        {userChildren.map((child) => renderNodePair(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto py-1 text-xs">
      {roots.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-600">
          No conversation yet. Select text in the document to start.
        </div>
      )}
      {roots.map((root) => renderNodePair(root, 0))}
    </div>
  )
}
