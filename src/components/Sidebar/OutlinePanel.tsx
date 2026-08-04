import { useAppContext } from '../../context/AppContext'
import { findGroupContainingTab } from '../../utils/layout'
import type { Heading } from '../../types'

export function OutlinePanel() {
  const { state } = useAppContext()

  // Get the active file's headings
  const activeFileId = (() => {
    if (!state.activeTabId || !state.layoutRoot) return null
    const group = findGroupContainingTab(state.layoutRoot, state.activeTabId)
    if (!group) return null
    const tab = group.tabs.find((t) => t.id === state.activeTabId)
    return tab?.fileId ?? null
  })()

  const activeFile = activeFileId ? state.openFiles[activeFileId] : null
  const headings = activeFile?.headings ?? []

  if (!activeFile) {
    return (
      <div className="px-4 py-8 text-center text-xs text-gray-400">
        Open a markdown file to see its outline
      </div>
    )
  }

  if (headings.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-gray-400">
        No headings found in this document
      </div>
    )
  }

  const handleClick = (line: number) => {
    // Scroll to the heading in the active MarkdownViewer
    const viewer = document.querySelector('.markdown-body')
    if (!viewer) return

    // Find the heading element by line data attribute
    const headingEl = viewer.querySelector(`[data-line="${line}"]`)
    if (headingEl) {
      headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      // Fallback: estimate position based on line number
      const lines = activeFile.content.split('\n')
      const charCount = lines.slice(0, line).join('\n').length
      const totalChars = activeFile.content.length
      const ratio = totalChars > 0 ? charCount / totalChars : 0
      viewer.scrollTo({
        top: ratio * viewer.scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  return (
    <div className="py-1">
      {headings.map((heading, idx) => (
        <button
          key={idx}
          onClick={() => handleClick(heading.line)}
          className="w-full text-left px-2 py-0.5 hover:bg-gray-200 text-sm text-gray-700 truncate block transition-colors"
          style={{ paddingLeft: `${8 + (heading.level - 1) * 16}px` }}
          title={heading.text}
        >
          <span className="text-gray-400 mr-1">H{heading.level}</span>
          {heading.text}
        </button>
      ))}
    </div>
  )
}
