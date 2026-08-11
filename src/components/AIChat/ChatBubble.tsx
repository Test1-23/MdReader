import type { ChatNode } from '../../utils/conversationTree'

interface ChatBubbleProps {
  node: ChatNode
  isActive: boolean
  onClick: () => void
}

export function ChatBubble({ node, isActive, onClick }: ChatBubbleProps) {
  const isUser = node.role === 'user'
  return (
    <div
      onClick={onClick}
      className={`
        px-3 py-2 cursor-pointer border-l-2 transition-colors text-xs
        ${isActive
          ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
        }
      `}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-sm">{isUser ? '👤' : '🤖'}</span>
        <span className="font-semibold text-gray-600 dark:text-gray-400">
          {isUser ? 'You' : 'AI'}
        </span>
        <span className="text-gray-400 dark:text-gray-600 text-[10px]">
          {new Date(node.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="text-gray-700 dark:text-gray-300 line-clamp-2 whitespace-pre-wrap">
        {node.content.slice(0, 120)}
      </p>
      {node.selectedText && (
        <div className="mt-1 text-[10px] text-gray-400 dark:text-gray-600 italic">
          📎 {node.selectedText.slice(0, 40)}...
        </div>
      )}
    </div>
  )
}
