import { useUIContext } from '../context/AppContext'
import { Download } from 'lucide-react'

export function DragDropOverlay() {
  const { state } = useUIContext()

  if (!state.isDragOver) return null

  return (
    <div className="fixed inset-0 z-50 bg-blue-500/10 flex items-center justify-center pointer-events-none">
      <div className="bg-chrome-raised rounded-2xl shadow-2xl px-12 py-10 text-center border-2 border-dashed border-blue-400">
        <Download size={48} className="mx-auto mb-4 text-blue-500" />
        <h2 className="text-xl font-semibold text-chrome-text mb-2">
          Drop your Markdown file here
        </h2>
        <p className="text-sm text-chrome-text-muted">
          Supports .md, .markdown, .mdown, .mkd, and .txt files
        </p>
      </div>
    </div>
  )
}
