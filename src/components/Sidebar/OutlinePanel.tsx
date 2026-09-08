import { useLayoutContext } from '../../context/AppContext'
import { findGroupContainingTab } from '../../utils/layout'
import { headingToId } from '../../utils/markdown'

export function OutlinePanel() {
  const { state } = useLayoutContext()

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
      <div className="px-4 py-8 text-center text-xs text-chrome-text-faint">
        Open a markdown file to see its outline
      </div>
    )
  }

  if (headings.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-chrome-text-faint">
        No headings found in this document
      </div>
    )
  }

  const handleClick = (headingText: string) => {
    const id = headingToId(headingText)
    // B19i: the same file can be open in several groups — scope the lookup to
    // the active group's content area instead of document-wide getElementById.
    const activeArea = document.querySelector('[data-active-group="true"]')
    const headingEl = activeArea
      ? activeArea.querySelector(`#${CSS.escape(id)}`)
      : document.getElementById(id)
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
            // include the line number — duplicated headings share the same id
            key={`${id}-${heading.line}`}
            onClick={() => handleClick(heading.text)}
            className="w-full text-left px-2.5 py-1 rounded-md hover:bg-chrome-hover text-[13px] text-chrome-text truncate block transition-colors"
            style={{ paddingLeft: `${8 + (heading.level - 1) * 16}px` }}
            title={heading.text}
          >
            <span className="text-chrome-text-faint mr-1">H{heading.level}</span>
            {heading.text}
          </button>
        )
      })}
    </div>
  )
}
