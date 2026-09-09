import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import remarkBreakEscapes from './remarkBreakEscapes'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useDarkMode } from '../../context/AppContext'
import { headingToId } from '../../utils/markdown'
import { bumpParseCount } from '../../utils/parseProbe'

// 纯解析组件：与选区/内联框状态解耦。
// memo 只按 content 比较 —— 父组件（MarkdownViewer）的 inline 状态变化
// 不会让这里重跑 remark → rehype-raw(parse5) → KaTeX → Prism 整条管线。

// Stable identity across renders — an inline array would defeat memoization.
// remark-math 解析 $...$ 行内 / $$...$$ 块级数学，rehype-katex 渲染为 KaTeX；
// remarkBreakEscapes 把字面 `\n` 转为换行；rehype-raw 支持内联 HTML。
// 顺序不可换：rehype-raw 会用 parse5 重解析整棵树，必须在 rehype-katex 之前。
const REMARK_PLUGINS = [remarkGfm, remarkMath, remarkBreakEscapes]
const REHYPE_PLUGINS = [rehypeRaw, rehypeKatex]

// ---- Module-level renderers (stable identity, no closure re-creation) ----

function extractText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    // <br> 是分隔符（与大纲侧的 normalizeHeadingText 归一化一致）
    if ((node as { type?: string }).type === 'br') return ' '
    return extractText((node as any).props.children)
  }
  return ''
}

// E3: same id algorithm as OutlinePanel navigation
function headingId(children: unknown): string {
  return headingToId(extractText(children))
}

const CODE_BLOCK_STYLE = {
  borderRadius: '12px',
  padding: '16px 20px',
  fontSize: '13px',
  lineHeight: '1.6',
}

// memo + 只订阅主题：拖拽/侧栏等 UI 变更不再让每个代码块重新分词高亮
const CodeRenderer = memo(function CodeRenderer({ className, children, ...props }: any) {
  const darkMode = useDarkMode()
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
      style={darkMode ? oneDark : oneLight}
      language={match ? match[1] : 'text'}
      PreTag="div"
      customStyle={CODE_BLOCK_STYLE}
    >
      {codeText.replace(/\n$/, '')}
    </SyntaxHighlighter>
  )
})

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
  // checked 只对 checkbox/radio 有意义 —— 其余类型透传会触发 React 警告
  if (type === 'radio') {
    return <input type="radio" checked={checked} readOnly {...props} />
  }
  return <input type={type} {...props} />
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

interface MarkdownBodyProps {
  content: string
}

/**
 * 只负责解析与渲染 markdown 本身。memo 以 content 为界 —— 任何与文档内容
 * 无关的状态变化（选区、内联引用框、拖拽、侧栏…）都不会触发重新解析。
 */
export const MarkdownBody = memo(function MarkdownBody({ content }: MarkdownBodyProps) {
  // 冒烟探针：一次渲染 = 一次完整解析（remark → rehype-raw → KaTeX → Prism）
  bumpParseCount()
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={COMPONENTS}
    >
      {content}
    </ReactMarkdown>
  )
})
