import { useAppContext } from '../../context/AppContext'
import { FileTreePanel } from './FileTreePanel'
import { OutlinePanel } from './OutlinePanel'

export function Sidebar() {
  const { state } = useAppContext()

  return (
    <div className="w-sidebar min-w-sidebar border-r border-sidebar-border bg-sidebar-bg flex flex-col overflow-hidden select-none">
      {/* Panel Header */}
      <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {state.activeActivity === 'files' ? 'Explorer' : 'Outline'}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto">
        {state.activeActivity === 'files' && <FileTreePanel />}
        {state.activeActivity === 'outline' && <OutlinePanel />}
      </div>
    </div>
  )
}
