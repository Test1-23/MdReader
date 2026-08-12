export function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900">
      <div className="text-center max-w-md px-8">
        {/* Icon */}
        <div className="text-6xl mb-6">📖</div>

        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
          MdReader
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 text-sm">
          A VSCode-style Markdown reader with editor groups, syntax highlighting, and GFM support.
        </p>

        {/* Action cards */}
        <div className="grid grid-cols-1 gap-3 text-left">
          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-2xl">📂</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Open a File</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Use the Explorer in the sidebar to browse folders and open markdown files.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-2xl">📥</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Drag & Drop</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Drag a .md file from your file system and drop it anywhere in this window.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <span className="text-2xl">📋</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Paste Markdown</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Copy markdown text and press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl+V</kbd> to
                paste and preview it instantly.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-8">
          Click the Explorer icon in the Activity Bar to get started
        </p>
      </div>
    </div>
  )
}
