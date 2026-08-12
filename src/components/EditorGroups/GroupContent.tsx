import { useLayoutContext } from '../../context/AppContext'
import type { TabEntry } from '../../types'
import { AI_WINDOW_ID } from '../../utils/windowDescriptor'
import { MarkdownViewer } from '../MarkdownViewer/MarkdownViewer'
import { RawSourceView } from '../RawSourceView/RawSourceView'
import { AIChatPanel } from '../AIChat/AIChatPanel'

interface GroupContentProps {
  tab: TabEntry
}

export function GroupContent({ tab }: GroupContentProps) {
  const { state } = useLayoutContext()
  const file = state.openFiles[tab.fileId]

  // AI 对话窗口 → 渲染聊天界面（作为布局树中的 tab）
  if (tab.fileId === AI_WINDOW_ID) {
    return (
      <div className="h-full overflow-hidden bg-white dark:bg-gray-900">
        <AIChatPanel tabId={tab.id} />
      </div>
    )
  }

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
