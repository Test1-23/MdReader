import { useEffect, useState, useRef, memo } from 'react'
import type { ChatNode } from '../../utils/conversationTree'

interface ChatBubbleProps {
  node: ChatNode
  isActive: boolean
  loading: boolean
  convId: string
  onCopy: (nodeId: string) => void
  onRegenerate: (nodeId: string) => void
  onEditStart: (nodeId: string) => void
  onEdit: (nodeId: string, newText: string) => void
  onEditCancel: () => void
  editing: boolean
}

const BTN_BASE = 'px-1.5 py-0.5 text-[10px] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

// memo: handlers are ref-stable (AIChatPanel), and untouched nodes keep their
// reference — only the streaming bubble re-renders per chunk
export const ChatBubble = memo(function ChatBubble({
  node,
  isActive,
  loading,
  convId,
  onCopy,
  onRegenerate,
  onEditStart,
  onEdit,
  onEditCancel,
  editing,
}: ChatBubbleProps) {
  const isUser = node.role === 'user'
  const [editText, setEditText] = useState(node.content)
  const [copied, setCopied] = useState(false)
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const userExpandedRef = useRef(false)
  const lastConvIdRef = useRef(convId)

  // 对话切换 → 重置展开状态
  useEffect(() => {
    if (lastConvIdRef.current !== convId) {
      lastConvIdRef.current = convId
      userExpandedRef.current = false
      setThinkingOpen(false)
    }
  }, [convId])

  // 进入编辑态时用当前节点内容初始化文本框
  useEffect(() => {
    if (editing) setEditText(node.content)
  }, [editing, node.content])

  // 思考块折叠控制：
  // - 默认全部折叠
  // - 仅当用户手动展开了上一条 + 当前正在流式中 → 自动展开
  // - 流式完成后保持用户选择的折叠状态
  useEffect(() => {
    if (node.reasoning) {
      if (loading && userExpandedRef.current) {
        setThinkingOpen(true)
      } else if (!loading) {
        // 流式完成后保持现状
      }
    } else {
      setThinkingOpen(false)
    }
  }, [node.reasoning, loading])

  const handleCopyClick = () => {
    onCopy(node.id)
    setCopied(true)
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  // 编辑模式下显示 textarea
  if (editing) {
    return (
      <div className="flex justify-end px-3 py-1.5">
        <div className="max-w-[85%] w-full bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 text-xs">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            className="w-full bg-transparent text-gray-800 dark:text-gray-200 resize-y focus:outline-none whitespace-pre-wrap"
          />
          <div className="flex justify-end gap-2 mt-1">
            <button
              onClick={onEditCancel}
              className="px-2 py-0.5 text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
            >
              Cancel
            </button>
            <button
              onClick={() => onEdit(node.id, editText)}
              className="px-2 py-0.5 text-[10px] bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-3 py-1.5`}>
      <div className={`max-w-[85%] ${isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
        <div
          className={`
            px-3 py-2 rounded-lg text-xs w-full
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
          {/* 可折叠思考块（DeepSeek 风格：粗箭头 + 耗时） */}
          {!isUser && node.reasoning && (
            <div className="mb-1.5 rounded bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  const next = !thinkingOpen
                  setThinkingOpen(next)
                  // B17: collapsing must reset the flag — otherwise the next
                  // reasoning chunk force-reopens the block mid-stream
                  userExpandedRef.current = next
                }}
                className="w-full px-2 py-1 text-left text-[10px] text-gray-500 dark:text-gray-400 transition-colors"
              >
                <span className="font-bold">{thinkingOpen ? '▾' : '▸'}</span>
                {' '}已深度思考
                {node.reasoningDuration
                  ? `（用时 ${Math.round(node.reasoningDuration / 1000)}s）`
                  : loading ? '...' : ''}
              </button>
              {thinkingOpen && (
                <div className="px-2 pb-1.5 text-[10px] text-gray-400 dark:text-gray-500 whitespace-pre-wrap break-words">
                  {node.reasoning}
                </div>
              )}
            </div>
          )}
          {/* 完整内容 */}
          <div className="whitespace-pre-wrap break-words">{node.content}</div>
        </div>

        {/* 常驻操作按钮（蓝色主题） */}
        <div className="flex gap-1 mt-0.5 px-1">
          <button
            onClick={handleCopyClick}
            className={`${BTN_BASE} text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 ${copied ? '!text-green-500 !bg-green-50 dark:!bg-green-900/30' : ''}`}
            title="复制"
          >
            {copied ? '✓ 已复制' : '📋 复制'}
          </button>
          {isUser ? (
            <>
              <button
                onClick={() => onEditStart(node.id)}
                disabled={loading}
                className={`${BTN_BASE} text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30`}
                title="编辑"
              >
                ✏️ 编辑
              </button>
              <button
                onClick={() => onRegenerate(node.id)}
                disabled={loading}
                className={`${BTN_BASE} text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30`}
                title="重发（覆盖回复）"
              >
                {loading ? '⏳ 重发中...' : '🔄 重发'}
              </button>
            </>
          ) : (
            <button
              onClick={() => onRegenerate(node.id)}
              disabled={loading}
              className={`${BTN_BASE} text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/30`}
              title="重新生成"
            >
              {loading ? '⏳ 生成中...' : '🔄 重新生成'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
