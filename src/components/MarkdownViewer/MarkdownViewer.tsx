import { memo, useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useUIContext, useLayoutDispatch, useUIDispatch } from '../../context/AppContext'
import { headingToId } from '../../utils/markdown'
import { createId } from '../../utils/fileReader'
import type { PendingQuote } from '../../types'
import { appendQuote, clampInlinePosition, shouldSubmit } from './inlineQuote'
import { InlineQuoteBox } from './InlineQuoteBox'

interface MarkdownViewerProps {
  content: string
}

// Stable identity across renders — an inline array would defeat memoization
const REMARK_PLUGINS = [remarkGfm]

// ---- Module-level renderers (stable identity, no closure re-creation) ----

function extractText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as any).props.children)
  }
  return ''
}

// E3: same id algorithm as OutlinePanel navigation
function headingId(children: unknown): string {
  return headingToId(extractText(children))
}

function CodeRenderer({ className, children, ...props }: any) {
  const { state: uiState } = useUIContext()
  const match = /language-(\w+)/.exec(className || '')
  const codeText = extractText(children)
  const isInline = !match && !codeText.includes('\n')

  if (isInline) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  return (
    <SyntaxHighlighter
      // B20j: match the code block theme to the app theme
      style={uiState.darkMode ? oneDark : oneLight}
      language={match ? match[1] : 'text'}
      PreTag="div"
      customStyle={{
        borderRadius: '8px',
        fontSize: '13px',
        lineHeight: '1.6',
      }}
    >
      {codeText.replace(/\n$/, '')}
    </SyntaxHighlighter>
  )
}

function H1Renderer({ children, ...props }: any) {
  return <h1 id={headingId(children)} {...props}>{children}</h1>
}
function H2Renderer({ children, ...props }: any) {
  return <h2 id={headingId(children)} {...props}>{children}</h2>
}
function H3Renderer({ children, ...props }: any) {
  return <h3 id={headingId(children)} {...props}>{children}</h3>
}
function H4Renderer({ children, ...props }: any) {
  return <h4 id={headingId(children)} {...props}>{children}</h4>
}
function H5Renderer({ children, ...props }: any) {
  return <h5 id={headingId(children)} {...props}>{children}</h5>
}
function H6Renderer({ children, ...props }: any) {
  return <h6 id={headingId(children)} {...props}>{children}</h6>
}

function LinkRenderer({ href, children, ...props }: any) {
  if (href?.startsWith('#')) {
    return <a href={href} {...props}>{children}</a>
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
}

function ImageRenderer({ src, alt, ...props }: any) {
  if (!src) return null
  return <img src={src} alt={alt || ''} {...props} />
}

function TableRenderer({ children, ...props }: any) {
  return (
    <div className="overflow-x-auto my-4">
      <table {...props}>{children}</table>
    </div>
  )
}

function InputRenderer({ type, checked, ...props }: any) {
  if (type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
        {...props}
      />
    )
  }
  return <input type={type} checked={checked} {...props} />
}

function BlockquoteRenderer({ children, ...props }: any) {
  return <blockquote {...props}>{children}</blockquote>
}

// Stable component map — never recreated across renders
const COMPONENTS = {
  code: CodeRenderer,
  h1: H1Renderer,
  h2: H2Renderer,
  h3: H3Renderer,
  h4: H4Renderer,
  h5: H5Renderer,
  h6: H6Renderer,
  a: LinkRenderer,
  img: ImageRenderer,
  table: TableRenderer,
  input: InputRenderer,
  blockquote: BlockquoteRenderer,
}

interface InlineQuoteState {
  x: number
  y: number
  quotes: PendingQuote[]
}

// memo: content-identical renders skip the full ReactMarkdown parse + Prism
// highlighting. Dispatch-only subscriptions keep this component out of layout
// and chat churn entirely (P1/R2).
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
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>

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
