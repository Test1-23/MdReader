import { memo, useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useUIContext, useLayoutDispatch, useUIDispatch } from '../../context/AppContext'
import { headingToId } from '../../utils/markdown'
import { createId } from '../../utils/fileReader'

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

interface QuoteBubble {
  x: number
  y: number
  text: string
}

// memo: content-identical renders skip the full ReactMarkdown parse + Prism
// highlighting. Dispatch-only subscriptions keep this component out of layout
// and chat churn entirely (P1/R2).
export const MarkdownViewer = memo(function MarkdownViewer({ content }: MarkdownViewerProps) {
  const layoutDispatch = useLayoutDispatch()
  const uiDispatch = useUIDispatch()
  const [bubble, setBubble] = useState<QuoteBubble | null>(null)

  // 划选 → 选区末尾浮出「📎 引用」气泡（不再自动打开 AI 窗口）
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest?.('[data-quote-bubble]')) return
    const sel = window.getSelection()
    const text = sel?.toString()?.trim()
    if (text && sel && sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      // 零面积选区（单纯点击）不显示气泡
      if (rect.width > 0 || rect.height > 0) {
        setBubble({
          x: Math.min(rect.right + 6, window.innerWidth - 96),
          y: Math.min(rect.bottom + 6, window.innerHeight - 44),
          text,
        })
        return
      }
    }
    setBubble(null)
  }, [])

  // 气泡消失：点击他处 / 滚动（预览在内部 overflow 容器滚动不冒泡，需 capture）/ Esc
  useEffect(() => {
    if (!bubble) return
    const dismiss = (e: Event) => {
      if ((e.target as HTMLElement).closest?.('[data-quote-bubble]')) return
      setBubble(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBubble(null)
    }
    document.addEventListener('mousedown', dismiss, true)
    document.addEventListener('scroll', dismiss, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', dismiss, true)
      document.removeEventListener('scroll', dismiss, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [bubble])

  const handleQuoteClick = useCallback(() => {
    if (!bubble) return
    uiDispatch({ type: 'ADD_QUOTE', payload: { id: createId('quote'), text: bubble.text } })
    // 复用统一窗口逻辑：聚焦最近 AI 窗口，否则最右侧分屏
    layoutDispatch({ type: 'OPEN_AI_WINDOW' })
    window.getSelection()?.removeAllRanges()
    setBubble(null)
  }, [bubble, uiDispatch, layoutDispatch])

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

      {/* 选区末尾浮动引用气泡 */}
      {bubble && (
        <button
          data-quote-bubble
          style={{ position: 'fixed', left: bubble.x, top: bubble.y, zIndex: 50 }}
          onMouseDown={(e) => e.preventDefault() /* 保住选区直到点击 */}
          onClick={handleQuoteClick}
          className="px-2.5 py-1 flex items-center gap-1 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg text-xs transition-colors"
          title="引用选中内容并打开 AI"
        >
          📎 引用
        </button>
      )}
    </div>
  )
})
