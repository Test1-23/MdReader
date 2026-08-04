import { useAppContext } from '../../context/AppContext'
import type { TabEntry } from '../../types'
import { MarkdownViewer } from '../MarkdownViewer/MarkdownViewer'
import { RawSourceView } from '../RawSourceView/RawSourceView'

interface GroupContentProps {
  tab: TabEntry
}

export function GroupContent({ tab }: GroupContentProps) {
  const { state } = useAppContext()
  const file = state.openFiles[tab.fileId]

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        File content not available
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      {tab.viewMode === 'preview' ? (
        <MarkdownViewer content={file.content} />
      ) : (
        <RawSourceView content={file.content} />
      )}
    </div>
  )
}
