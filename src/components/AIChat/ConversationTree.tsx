import type { Conversation, ChatNode } from '../../utils/conversationTree'
import { getActivePath, getChildren } from '../../utils/conversationTree'
import { ChatBubble } from './ChatBubble'

interface ConversationTreeProps {
  conv: Conversation
  activeNodeId: string | null
  onSwitchBranch: (nodeId: string) => void
}

export function ConversationTree({ conv, activeNodeId, onSwitchBranch }: ConversationTreeProps) {
  const activePath = getActivePath(conv)
  const activePathIds = new Set(activePath.map((n) => n.id))

  // Render all root nodes and recursively their children
  const renderNode = (nodeId: string, depth: number = 0): JSX.Element | null => {
    const node = conv.nodes[nodeId]
    if (!node) return null

    const children = getChildren(conv, nodeId)
    const isOnActivePath = activePathIds.has(nodeId)

    return (
      <div key={nodeId}>
        <div style={{ paddingLeft: `${depth * 12}px` }}>
          <ChatBubble
            node={node}
            isActive={nodeId === activeNodeId}
            onClick={() => onSwitchBranch(nodeId)}
          />
        </div>
        {/* Render children in reverse order (newest at bottom) if on active path, otherwise show only active-path child */}
        {isOnActivePath
          ? children.map((child) => renderNode(child.id, depth + 1))
          : children.filter((c) => activePathIds.has(c.id)).map((child) => renderNode(child.id, depth + 1))
        }
      </div>
    )
  }

  const rootNodes = conv.rootId ? getRootAndSiblings(conv, conv.rootId) : []

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {rootNodes.length === 0 && (
        <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-600">
          No messages yet. Select text in the document to start.
        </div>
      )}
      {rootNodes.map((node) => renderNode(node.id, 0))}
    </div>
  )
}

function getRootAndSiblings(conv: Conversation, nodeId: string): ChatNode[] {
  const node = conv.nodes[nodeId]
  if (!node) return []
  if (!node.parentId) return [node]
  const siblings = conv.nodes[node.parentId]?.childrenIds.map((id) => conv.nodes[id]).filter(Boolean) || []
  return siblings
}
