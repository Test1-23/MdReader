import { useState, useRef, useEffect } from 'react'

interface ChatInputProps {
  selectedText: string | null
  onSend: (message: string) => void
  disabled: boolean
}

export function ChatInput({ selectedText, onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [selectedText])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
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
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the selected text..."
          rows={2}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="px-4 py-2 text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded transition-colors disabled:cursor-not-allowed self-end"
        >
          {disabled ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
