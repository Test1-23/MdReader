import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownViewerProps {
  content: string
}

// ---- Module-level renderers (stable identity, no closure re-creation) ----

function extractText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as any).props.children)
  }
  return ''
}

function headingId(children: unknown): string {
  return extractText(children)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w一-鿿-]/g, '')
}

function CodeRenderer({ className, children, ...props }: any) {
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
      style={oneLight}
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

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="markdown-body max-w-4xl mx-auto px-8 py-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
