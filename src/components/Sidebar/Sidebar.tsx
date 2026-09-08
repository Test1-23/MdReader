import { useUIContext } from '../../context/AppContext'
import { Files, ListTree, Settings, Sun, Moon } from 'lucide-react'
import { FileTreePanel } from './FileTreePanel'
import { OutlinePanel } from './OutlinePanel'
import { SettingsPanel } from './SettingsPanel'
import { PanelHeader } from '../shared/PanelHeader'

const PANEL_META = {
  files: { title: 'Explorer', icon: Files },
  outline: { title: 'Outline', icon: ListTree },
  settings: { title: 'Settings', icon: Settings },
} as const

export function Sidebar() {
  const { state, dispatch } = useUIContext()
  const meta = PANEL_META[state.activeActivity]

  return (
    <div className="w-sidebar min-w-sidebar border-r border-chrome-border bg-chrome-subtle flex flex-col overflow-hidden select-none">
      {/* Panel Header */}
      <PanelHeader icon={meta.icon} title={meta.title} />

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto">
        {state.activeActivity === 'files' && <FileTreePanel />}
        {state.activeActivity === 'outline' && <OutlinePanel />}
        {state.activeActivity === 'settings' && <SettingsPanel />}
      </div>

      {/* Dark Mode Toggle */}
      <div className="px-3 py-2 border-t border-chrome-border">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_DARK_MODE' })}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[13px] hover:bg-chrome-hover text-chrome-text-muted transition-colors"
        >
          {state.darkMode ? <Sun size={14} /> : <Moon size={14} />}
          <span>{state.darkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </div>
  )
}
