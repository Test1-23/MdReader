import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useLayoutDispatch, useUIDispatch } from '../../context/AppContext'
import { createId } from '../../utils/fileReader'
import type { PendingQuote } from '../../types'
import { appendQuote, clampInlinePosition, shouldSubmit } from './inlineQuote'
import { InlineQuoteBox } from './InlineQuoteBox'
import { MarkdownBody } from './MarkdownBody'

interface MarkdownViewerProps {
  content: string
}

interface InlineQuoteState {
  x: number
  y: number
  quotes: PendingQuote[]
}

/**
 * 选区交互外壳。文档解析被隔离在 memo 的 MarkdownBody 里 —— 这里的
 * inline 状态（弹框/追加/删 chip）变化不会触发 markdown 重新解析。
 */
export const MarkdownViewer = memo(function MarkdownViewer({ content }: MarkdownViewerProps) {
  const layoutDispatch = useLayoutDispatch()
  const uiDispatch = useUIDispatch()
  const [inline, setInline] = useState<InlineQuoteState | null>(null)
  const downInsideRef = useRef(false)

  // 划选 → 选区末尾浮出内联提问输入框（不再自动打开 AI 窗口）；
  // 输入框打开期间继续划选 → 追加引用（保持在原位置，清选区并重聚焦输入框）
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    // 内联框内部操作（选择 textarea 文本 / 点 chip）不触发追加或关闭
    if (target.closest?.('[data-inline-quote-box]')) return
    // 框内拖选在框外释放：不追加、不关闭
    if (inline && downInsideRef.current) return
    const sel = window.getSelection()
    const text = sel?.toString()?.trim()
    if (text && sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      // 零面积选区（单纯点击）不开框
      if (rect.width > 0 || rect.height > 0) {
        if (inline) {
          setInline((prev) =>
            prev ? { ...prev, quotes: appendQuote(prev.quotes, { id: createId('quote'), text }) } : prev)
          sel.removeAllRanges()
          requestAnimationFrame(() => {
            document.querySelector<HTMLTextAreaElement>('[data-inline-quote-input]')?.focus()
          })
        } else {
          const { x, y } = clampInlinePosition(rect, window.innerWidth, window.innerHeight)
          setInline({ x, y, quotes: [{ id: createId('quote'), text }] })
          sel.removeAllRanges()
        }
        return
      }
    }
    setInline(null)
  }, [inline])

  // 手势感知消失状态机（打开期间）：
  // - mousedown 只记录是否落在框内，不消失（否则第二次划选无法追加）
  // - mouseup（capture）才判定：框外 + 无实际选区 → 消失
  // - 滚动（capture，预览在内部 overflow 容器滚动不冒泡）/ Esc → 消失
  useEffect(() => {
    if (!inline) return
    const onMouseDown = (e: Event) => {
      downInsideRef.current = !!(e.target as HTMLElement).closest?.('[data-inline-quote-box]')
    }
    const onMouseUp = (e: Event) => {
      const target = e.target as HTMLElement
      if (downInsideRef.current || target.closest?.('[data-inline-quote-box]')) return
      // 有实际选区（正在做新划选）→ 不消失，交给 handleMouseUp 追加
      const sel = window.getSelection()
      const text = sel?.toString()?.trim()
      if (text && sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        if (rect.width > 0 || rect.height > 0) return
      }
      setInline(null)
    }
    const onScroll = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('[data-inline-quote-box]')) return
      setInline(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInline(null)
    }
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('mouseup', onMouseUp, true)
    document.addEventListener('scroll', onScroll, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('mouseup', onMouseUp, true)
      document.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [inline])

  // 提交：引用进全局 chip + 问题填入 AI 窗口 ChatInput（不自动发送）+ 打开/聚焦 AI 窗
  // 引用仅在提交时进全局 —— 消失路径零泄漏
  const handleInlineSubmit = useCallback((text: string) => {
    if (!inline) return
    const trimmed = text.trim()
    if (!shouldSubmit(trimmed, inline.quotes.length)) return
    for (const quote of inline.quotes) {
      uiDispatch({ type: 'ADD_QUOTE', payload: quote })
    }
    uiDispatch({ type: 'SET_PENDING_DRAFT', payload: { text: trimmed } })
    // 复用统一窗口逻辑：聚焦最近 AI 窗口，否则最右侧分屏
    layoutDispatch({ type: 'OPEN_AI_WINDOW' })
    window.getSelection()?.removeAllRanges()
    setInline(null)
  }, [inline, uiDispatch, layoutDispatch])

  return (
    <div
      className="markdown-body max-w-4xl mx-auto px-8 py-6 bg-white dark:bg-gray-900"
      onMouseUp={handleMouseUp}
    >
      <MarkdownBody content={content} />

      {/* 选区末尾内联提问输入框 */}
      {inline && (
        <InlineQuoteBox
          x={inline.x}
          y={inline.y}
          quotes={inline.quotes}
          onRemoveQuote={(id) =>
            setInline((prev) => prev ? { ...prev, quotes: prev.quotes.filter((q) => q.id !== id) } : prev)}
          onSubmit={handleInlineSubmit}
        />
      )}
    </div>
  )
})
