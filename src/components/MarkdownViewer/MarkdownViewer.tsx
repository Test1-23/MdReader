import React, { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownViewerProps {
  content: string
}

// Map line indices to heading elements
function addLineNumbers(content: string): string {
  const lines = content.split('\n')
  return lines
    .map((line, i) => {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        // We'll use a data attribute on the rendered output
        return line
      }
      return line
    })
    .join('\n')
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  const processedContent = useMemo(() => content, [content])

  return (
    <div className="markdown-body max-w-4xl mx-auto px-8 py-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks with syntax highlighting
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !String(children).includes('\n')

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
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          },

          // Headings with data-line attribute for scroll navigation
          h1({ children, ...props }: any) {
            return <h1 {...props}>{children}</h1>
          },
          h2({ children, ...props }: any) {
            return <h2 {...props}>{children}</h2>
          },
          h3({ children, ...props }: any) {
            return <h3 {...props}>{children}</h3>
          },
          h4({ children, ...props }: any) {
            return <h4 {...props}>{children}</h4>
          },
          h5({ children, ...props }: any) {
            return <h5 {...props}>{children}</h5>
          },
          h6({ children, ...props }: any) {
            return <h6 {...props}>{children}</h6>
          },

          // Links open in default browser (for Electron)
          a({ href, children, ...props }: any) {
            // Handle heading anchor links
            if (href?.startsWith('#')) {
              return (
                <a href={href} {...props}>
                  {children}
                </a>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            )
          },

          // Images
          img({ src, alt, ...props }: any) {
            if (!src) return null
            return <img src={src} alt={alt || ''} {...props} />
          },

          // Tables
          table({ children, ...props }: any) {
            return (
              <div className="overflow-x-auto my-4">
                <table {...props}>{children}</table>
              </div>
            )
          },

          // Task list checkboxes
          input({ type, checked, ...props }: any) {
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
          },

          // Blockquotes
          blockquote({ children, ...props }: any) {
            return <blockquote {...props}>{children}</blockquote>
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}
