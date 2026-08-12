import { useUIContext } from '../context/AppContext'

export function DragDropOverlay() {
  const { state } = useUIContext()

  if (!state.isDragOver) return null

  return (
    <div className="fixed inset-0 z-50 bg-blue-500/10 flex items-center justify-center pointer-events-none">
      {/* B20i: dark-mode variants */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl px-12 py-10 text-center border-2 border-dashed border-blue-400">
        <div className="text-5xl mb-4">📥</div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
          Drop your Markdown file here
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Supports .md, .markdown, .mdown, .mkd, and .txt files
        </p>
      </div>
    </div>
  )
}
