import { useState, useRef, useEffect } from 'react'

interface ChatInputProps {
  selectedText: string | null
  // B16: thinking flag rides along with the message so the panel can pass it
  // through to the main process (chat_template_kwargs for DeepSeek-style models)
  onSend: (message: string, thinking: boolean) => void
  streaming: boolean
  onStop: () => void
}

export function ChatInput({ selectedText, onSend, streaming, onStop }: ChatInputProps) {
  const [input, setInput] = useState('')
  const [deepThink, setDeepThink] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const didFocus = useRef(false)

  // 仅在面板首次挂载时聚焦一次 —— 划选新文本不再抢占文档焦点
  useEffect(() => {
    if (!didFocus.current) {
      inputRef.current?.focus()
      didFocus.current = true
    }
  }, [])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || streaming) return
    onSend(trimmed, deepThink)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-3">
      {selectedText && (
        <div className="mb-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-[10px] text-gray-500 dark:text-gray-400 max-h-16 overflow-y-auto">
          <span className="font-semibold">📎 Selected:</span>{' '}
          {selectedText.slice(0, 200)}
          {selectedText.length > 200 && '...'}
        </div>
      )}
      {/* 深度思考开关（输入框上方，仿 DeepSeek） */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setDeepThink(!deepThink)}
          className={`
            px-3 py-1 rounded-full text-[10px] border transition-colors
            ${deepThink
              ? 'bg-blue-500 text-white border-blue-500'
              : 'text-blue-500 border-blue-300 hover:bg-blue-50 dark:border-blue-600 dark:hover:bg-blue-900/30'}
          `}
          title="深度思考"
        >
          🧠 深度思考
        </button>
      </div>
      {/* DeepSeek 风格：大圆角输入框 + 右下角内嵌按钮 */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the selected text..."
          rows={2}
          className="w-full px-4 py-3 pr-12 text-xs border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-shadow"
        />
        {/* 发送 / 停止按钮（内嵌右下角，蓝色主题） */}
        <button
          onClick={streaming ? onStop : handleSend}
          disabled={!streaming && !input.trim()}
          className={`
            absolute right-2 bottom-2 w-8 h-8 flex items-center justify-center transition-colors
            ${streaming
              ? 'bg-blue-500 text-white hover:bg-red-500 rounded-md'
              : 'bg-blue-500 text-white hover:bg-blue-600 rounded-full'
            }
            ${!streaming && !input.trim() ? 'bg-blue-200 text-blue-400 cursor-not-allowed hover:bg-blue-200' : ''}
          `}
          title={streaming ? '停止生成' : '发送'}
        >
          {streaming ? <span className="w-2.5 h-2.5 bg-current rounded-[2px]" /> : <span className="text-sm leading-none">↑</span>}
        </button>
      </div>
    </div>
  )
}
