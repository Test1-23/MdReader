import { useState } from 'react'
import { useLayoutDispatch } from '../context/AppContext'
import { useElectronAPI } from '../hooks/useElectronAPI'
import { openFileByPath, generateTabId } from '../utils/fileReader'

export function EmptyState() {
  const dispatch = useLayoutDispatch()
  const { readFile, isElectron } = useElectronAPI()
  const [tip, setTip] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  // B20m: "Open a File" card actually opens the file dialog and loads the file
  const handleOpenFile = async () => {
    if (!isElectron || !window.electronAPI) {
      setTip('文件选择需要桌面应用环境。也可以直接拖入文件或按 Ctrl+V 粘贴。')
      return
    }
    setOpening(true)
    try {
      const path = await window.electronAPI.openFileDialog()
      if (path) {
        const openFile = await openFileByPath(path, readFile)
        dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: generateTabId() } })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setTip(`打开失败：${msg}`)
    } finally {
      setOpening(false)
    }
  }

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
          <button
            onClick={handleOpenFile}
            disabled={opening}
            className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-left hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            <span className="text-2xl">📂</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                {opening ? 'Opening…' : 'Open a File'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Use the Explorer in the sidebar to browse folders and open markdown files.
              </p>
            </div>
          </button>

          <button
            onClick={() => setTip('直接把 .md 文件拖入窗口任意位置即可打开。')}
            className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-left hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer"
          >
            <span className="text-2xl">📥</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Drag & Drop</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Drag a .md file from your file system and drop it anywhere in this window.
              </p>
            </div>
          </button>

          <button
            onClick={() => setTip('复制 Markdown 文本后，按 Ctrl+V 即可粘贴并即时预览。')}
            className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-left hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer"
          >
            <span className="text-2xl">📋</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Paste Markdown</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Copy markdown text and press <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl+V</kbd> to
                paste and preview it instantly.
              </p>
            </div>
          </button>
        </div>

        {tip && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-4">💡 {tip}</p>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
          Click the Explorer icon in the Activity Bar to get started
        </p>
      </div>
    </div>
  )
}
