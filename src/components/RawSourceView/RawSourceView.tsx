import { memo } from 'react'

interface RawSourceViewProps {
  content: string
}

// memo: content-identical renders skip rebuilding the full line-by-line DOM
export const RawSourceView = memo(function RawSourceView({ content }: RawSourceViewProps) {
  const lines = content.split('\n')

  return (
    <div className="h-full overflow-auto bg-chrome-subtle font-mono text-sm">
      <div className="flex">
        {/* Line numbers */}
        <div className="flex-shrink-0 py-3 select-none text-right text-chrome-text-faint bg-chrome-subtle border-r border-chrome-border">
          {lines.map((_, i) => (
            <div
              key={i}
              className="px-4 leading-6 text-xs"
              style={{ minWidth: '3.5rem' }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code content */}
        <pre className="flex-1 py-3 px-4 overflow-x-auto leading-6 text-chrome-text m-0">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="whitespace-pre">
                {line || ' '}
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
})
