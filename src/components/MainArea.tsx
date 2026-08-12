import { useLayoutContext } from '../context/AppContext'
import { EditorGroupTree } from './EditorGroups/EditorGroupTree'
import { EmptyState } from './EmptyState'

export function MainArea() {
  const { state } = useLayoutContext()

  if (!state.layoutRoot) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-editor-bg">
      <EditorGroupTree node={state.layoutRoot} />
    </div>
  )
}
