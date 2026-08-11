import type { ChatNode } from '../../utils/conversationTree'

interface ChatBubbleProps {
  node: ChatNode
  isActive: boolean
  onClick: () => void
}

export function ChatBubble({ node, isActive, onClick }: ChatBubbleProps) {
  const isUser = node.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-3 py-1.5`}>
      <div
        onClick={onClick}
        className={`
          max-w-[85%] px-3 py-2 rounded-lg text-xs cursor-pointer
          ${isUser
            ? 'bg-blue-500 text-white rounded-br-none'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-none'
          }
          ${isActive ? 'ring-2 ring-blue-400' : ''}
        `}
      >
        {/* 头部：角色 + 时间 */}
        <div className="flex items-center gap-1.5 mb-1 opacity-70">
          <span>{isUser ? '👤' : '🤖'}</span>
          <span className="font-semibold">{isUser ? 'You' : 'AI'}</span>
          <span className="text-[10px]">
            {new Date(node.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {/* 选中文本引用块 */}
        {node.selectedText && (
          <div className="mb-1.5 p-1.5 bg-black/10 dark:bg-white/10 rounded text-[10px] italic whitespace-pre-wrap">
            {node.selectedText}
          </div>
        )}
        {/* 完整内容 */}
        <div className="whitespace-pre-wrap break-words">{node.content}</div>
      </div>
    </div>
  )
}
