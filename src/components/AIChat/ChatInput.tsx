import { useState, useRef, useEffect } from 'react'
import type { PendingQuote } from '../../types'
import { useUIDispatch } from '../../context/AppContext'
import { Paperclip, X, Brain, ArrowUp } from 'lucide-react'
import { IconButton } from '../shared/IconButton'

interface ChatInputProps {
  pendingQuotes: PendingQuote[]
  onRemoveQuote: (id: string) => void
  // B16: thinking flag rides along with the message so the panel can pass it
  // through to the main process (chat_template_kwargs for DeepSeek-style models)
  onSend: (message: string, thinking: boolean) => void
  streaming: boolean
  onStop: () => void
  // 内联输入框提交的草稿 —— 仅活跃窗口消费
  pendingDraft: string | null
  isActiveWindow: boolean
}

export function ChatInput({ pendingQuotes, onRemoveQuote, onSend, streaming, onStop, pendingDraft, isActiveWindow }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [deepThink, setDeepThink] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const didFocus = useRef(false)
  const dispatch = useUIDispatch()

  // 仅在面板首次挂载时聚焦一次 —— 划选新文本不再抢占文档焦点
  useEffect(() => {
    if (!didFocus.current) {
      inputRef.current?.focus()
      didFocus.current = true
    }
  }, [])

  // 消费内联输入框的草稿：仅活跃 AI 窗口填写并聚焦（React 18 批处理保证
  // 同一 commit 内看到 activeTabId 与 pendingDraft；StrictMode 下幂等）
  useEffect(() => {
    if (pendingDraft !== null && isActiveWindow) {
      setInput(pendingDraft)
      inputRef.current?.focus()
      dispatch({ type: 'CLEAR_PENDING_DRAFT' })
    }
  }, [pendingDraft, isActiveWindow, dispatch])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || streaming) return
    onSend(trimmed, deepThink)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // IME 守卫：中文输入法组合确认的 Enter 不能触发发送
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-chrome-border p-3">
      {/* 多条引用 chip 列表（可逐条删除） */}
      {pendingQuotes.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1 max-h-16 overflow-y-auto">
          {pendingQuotes.map((quote) => (
            <span
              key={quote.id}
              data-quote-chip
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-full text-[10px] text-blue-700 dark:text-blue-300 max-w-full"
              title={quote.text}
            >
              <Paperclip size={12} className="flex-shrink-0" />
              <span className="truncate max-w-[180px]">
                {quote.text.length > 80 ? `${quote.text.slice(0, 80)}…` : quote.text}
              </span>
              <IconButton
                icon={X}
                title="移除引用"
                size="xs"
                round
                onClick={() => onRemoveQuote(quote.id)}
                className="!w-4 !h-4 text-blue-500 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              />
            </span>
          ))}
        </div>
      )}
      {/* 深度思考开关（输入框上方，仿 DeepSeek） */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setDeepThink(!deepThink)}
          className={`
            inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] border transition-colors
            ${deepThink
              ? 'bg-blue-600 text-white border-blue-600'
              : 'text-blue-600 border-blue-300 hover:bg-blue-50 dark:border-blue-600 dark:hover:bg-blue-900/30'}
          `}
          title="深度思考"
        >
          <Brain size={14} />
          深度思考
        </button>
      </div>
      {/* DeepSeek 风格：大圆角输入框 + 右下角内嵌按钮 */}
      <div className="relative">
        <textarea
          ref={inputRef}
          data-chat-input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the selected text..."
          rows={2}
          className="w-full px-4 py-3 pr-12 text-[13px] border border-chrome-border rounded-2xl bg-chrome-surface text-chrome-text resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-shadow"
        />
        {/* 发送 / 停止按钮（内嵌右下角，蓝色主题） */}
        <button
          onClick={streaming ? onStop : handleSend}
          disabled={!streaming && !input.trim()}
          className={`
            absolute right-2 bottom-2 w-8 h-8 flex items-center justify-center transition-colors
            ${streaming
              ? 'bg-blue-600 text-white hover:bg-red-500 rounded-md'
              : 'bg-blue-600 text-white hover:bg-blue-700 rounded-full'
            }
            ${!streaming && !input.trim() ? 'bg-blue-200 text-blue-400 cursor-not-allowed hover:bg-blue-200' : ''}
          `}
          title={streaming ? '停止生成' : '发送'}
        >
          {streaming ? <span className="w-2.5 h-2.5 bg-current rounded-[2px]" /> : <ArrowUp size={16} />}
        </button>
      </div>
    </div>
  )
}
