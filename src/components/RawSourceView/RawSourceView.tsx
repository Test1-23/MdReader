interface RawSourceViewProps {
  content: string
}

export function RawSourceView({ content }: RawSourceViewProps) {
  const lines = content.split('\n')

  return (
    <div className="h-full overflow-auto bg-gray-50 font-mono text-sm">
      <div className="flex">
        {/* Line numbers */}
        <div className="flex-shrink-0 py-3 select-none text-right text-gray-400 bg-gray-100 border-r border-gray-200">
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
        <pre className="flex-1 py-3 px-4 overflow-x-auto leading-6 text-gray-800 m-0">
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
}
