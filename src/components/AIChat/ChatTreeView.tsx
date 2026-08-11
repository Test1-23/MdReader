import { useState } from 'react'
import type { Conversation } from '../../utils/conversationTree'
import { getActivePath } from '../../utils/conversationTree'
import { computeTreeLayout, NODE_RADIUS } from '../../utils/treeLayout'
import type { TreeLayoutNode } from '../../utils/treeLayout'

interface ChatTreeViewProps {
  conv: Conversation
  activeNodeId: string | null
  onSelectNode: (nodeId: string) => void
}

export function ChatTreeView({ conv, activeNodeId, onSelectNode }: ChatTreeViewProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())

  const activePath = getActivePath(conv)
  const activePathIds = new Set(activePath.map((n) => n.id))

  const layout = computeTreeLayout(conv, activePathIds, collapsedIds)

  const toggleCollapse = (nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  // SVG 连线路径（垂直贝塞尔曲线）
  const edgePath = (from: TreeLayoutNode, to: TreeLayoutNode): string => {
    const midY = (from.y + to.y) / 2
    return `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`
  }

  const renderNode = (node: TreeLayoutNode) => {
    const isActive = activePathIds.has(node.id)
    const isCurrent = node.id === activeNodeId
    const hasChildren = node.hasChildren && !node.collapsed

    return (
      <div
        key={node.id}
        className="absolute"
        style={{ left: node.x - NODE_RADIUS, top: node.y - NODE_RADIUS, width: 200 }}
      >
        {/* 折叠按钮 */}
        {node.hasChildren && (
          <button
            onClick={() => toggleCollapse(node.id)}
            className={`
              absolute w-4 h-4 flex items-center justify-center rounded-full text-[10px] leading-none
              -left-5 top-0.5 border transition-colors
              ${node.collapsed
                ? 'bg-white dark:bg-gray-800 border-gray-400 text-gray-500 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500'
                : 'bg-blue-500 border-blue-500 text-white'}
            `}
            title={node.collapsed ? 'Expand' : 'Collapse'}
          >
            {node.collapsed ? '+' : '−'}
          </button>
        )}

        {/* 圆形节点 */}
        <div
          className={`
            absolute rounded-full border-2
            ${isCurrent
              ? 'bg-blue-500 border-blue-300'
              : isActive
                ? 'bg-blue-200 dark:bg-blue-800 border-blue-500'
                : 'bg-white dark:bg-gray-800 border-gray-400 dark:border-gray-600'
            }
          `}
          style={{ width: NODE_RADIUS * 2, height: NODE_RADIUS * 2, left: 0, top: 0 }}
        />

        {/* 摘要文字（节点右侧） */}
        <button
          onClick={() => onSelectNode(node.id)}
          className={`
            ml-6 text-left w-[calc(100%-24px)] rounded px-1.5 py-0.5 transition-colors
            ${isActive
              ? 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
          `}
        >
          <div className={`text-[11px] truncate ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
            👤 {node.user.content.slice(0, 40) || '(empty)'}
          </div>
          {node.assistant && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
              🤖 {node.assistant.content.slice(0, 40)}
            </div>
          )}
        </button>
      </div>
    )
  }

  if (layout.nodes.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-600">
        No conversation yet. Select text in the document to start.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
      <div style={{ width: layout.width, height: layout.height, position: 'relative' }}>
        {/* SVG 连线层 */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={layout.width}
          height={layout.height}
        >
          {layout.edges.map((edge, i) => (
            <path
              key={i}
              d={edgePath(edge.from, edge.to)}
              stroke={edge.isActive ? '#3b82f6' : '#9ca3af'}
              strokeWidth={edge.isActive ? 2 : 1}
              strokeDasharray={edge.isActive ? undefined : '4 3'}
              fill="none"
            />
          ))}
        </svg>

        {/* 节点层 */}
        {layout.nodes.map((node) => renderNode(node))}
      </div>
    </div>
  )
}
