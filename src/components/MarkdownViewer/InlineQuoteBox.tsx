import { memo, useEffect, useRef } from 'react'
import type { PendingQuote } from '../../types'
import { INLINE_TEXTAREA_MAX_H } from './inlineQuote'
import { Paperclip, X, ArrowUp } from 'lucide-react'
import { IconButton } from '../shared/IconButton'

interface InlineQuoteBoxProps {
  x: number
  y: number
  quotes: PendingQuote[]
  onRemoveQuote: (id: string) => void
  onSubmit: (text: string) => void
}

// memo + 非受控 textarea：文本只存在于 ref，逐键输入不会触发父组件
// （MarkdownViewer）的全文档重渲染/重解析。
export const InlineQuoteBox = memo(function InlineQuoteBox({
  x, y, quotes, onRemoveQuote, onSubmit,
}: InlineQuoteBoxProps) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  // 挂载即聚焦 + 初始自增高
  useEffect(() => {
    const el = textRef.current
    if (el) {
      el.focus()
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, INLINE_TEXTAREA_MAX_H)}px`
    }
  }, [])

  const grow = () => {
    const el = textRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, INLINE_TEXTAREA_MAX_H)}px`
  }

  const submit = () => {
    if (composingRef.current) return
    onSubmit(textRef.current?.value ?? '')
  }

  return (
    <div
      data-inline-quote-box
      className="fixed z-50 w-[360px] max-w-[calc(100vw-16px)] bg-chrome-raised border border-chrome-border rounded-xl shadow-xl p-2.5 flex flex-col gap-1.5"
      style={{ left: x, top: y }}
    >
      {/* 已引用 mini-chip 列表（本地，提交时才进全局） */}
      {quotes.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
          {quotes.map((quote) => (
            <span
              key={quote.id}
              data-inline-quote-chip
              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-full text-[10px] text-blue-700 dark:text-blue-300 max-w-full"
              title={quote.text}
            >
              <Paperclip size={12} className="flex-shrink-0" />
              <span className="truncate max-w-[120px]">
                {quote.text.length > 40 ? `${quote.text.slice(0, 40)}…` : quote.text}
              </span>
              <IconButton
                icon={X}
                title="移除引用"
                size="xs"
                round
                onClick={() => onRemoveQuote(quote.id)}
                className="!w-3.5 !h-3.5 text-blue-500 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              />
            </span>
          ))}
        </div>
      )}

      {/* 多行自增高 textarea（Enter 换行，Ctrl/Cmd+Enter 提交） */}
      <textarea
        ref={textRef}
        data-inline-quote-input
        rows={1}
        placeholder="询问 AI 选中的内容…（Ctrl+Enter 提交）"
        onInput={grow}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            // IME 组合中的 Ctrl+Enter 不提交
            if (!e.nativeEvent.isComposing) submit()
          }
        }}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        className="w-full px-2.5 py-1.5 text-[13px] border border-chrome-border rounded-lg bg-chrome-surface text-chrome-text resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 overflow-y-auto"
      />

      {/* 提交按钮 */}
      <div className="flex justify-end">
        <button
          data-inline-submit
          onClick={submit}
          className="w-7 h-7 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
          title="填入 AI 窗口（Ctrl+Enter）"
        >
          <ArrowUp size={14} />
        </button>
      </div>
    </div>
  )
})
