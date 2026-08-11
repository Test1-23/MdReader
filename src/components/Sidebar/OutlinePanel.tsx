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
      <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
        Open a markdown file to see its outline
      </div>
    )
  }

  if (headings.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
        No headings found in this document
      </div>
    )
  }

  const headingToId = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w一-鿿-]/g, '')
  }

  const handleClick = (headingText: string) => {
    const id = headingToId(headingText)
    const headingEl = document.getElementById(id)
    if (headingEl) {
      headingEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="py-1">
      {headings.map((heading) => {
        const id = headingToId(heading.text)
        return (
          <button
            key={id}
            onClick={() => handleClick(heading.text)}
            className="w-full text-left px-2 py-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 truncate block transition-colors"
            style={{ paddingLeft: `${8 + (heading.level - 1) * 16}px` }}
            title={heading.text}
          >
            <span className="text-gray-400 dark:text-gray-500 mr-1">H{heading.level}</span>
            {heading.text}
          </button>
        )
      })}
    </div>
  )
}
