import { useAppContext } from '../../context/AppContext'
import { FileTreePanel } from './FileTreePanel'
import { OutlinePanel } from './OutlinePanel'

export function Sidebar() {
  const { state, dispatch } = useAppContext()

  return (
    <div className="w-sidebar min-w-sidebar border-r border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex flex-col overflow-hidden select-none">
      {/* Panel Header */}
      <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {state.activeActivity === 'files' ? 'Explorer' : 'Outline'}
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto">
        {state.activeActivity === 'files' && <FileTreePanel />}
        {state.activeActivity === 'outline' && <OutlinePanel />}
      </div>

      {/* Dark Mode Toggle */}
      <div className="px-3 py-2 border-t border-gray-300 dark:border-gray-700">
        <button
          onClick={() => dispatch({ type: 'TOGGLE_DARK_MODE' })}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
        >
          <span>{state.darkMode ? '☀️' : '🌙'}</span>
          <span>{state.darkMode ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </div>
  )
}
