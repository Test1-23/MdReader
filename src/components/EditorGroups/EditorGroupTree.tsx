import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { isEditorGroup, isSplitNode } from '../../types'
import type { LayoutNode } from '../../types'
import { useLayoutDispatch } from '../../context/AppContext'
import { EditorGroup } from './EditorGroup'

interface EditorGroupTreeProps {
  node: LayoutNode
}

export function EditorGroupTree({ node }: EditorGroupTreeProps) {
  const dispatch = useLayoutDispatch()

  if (isEditorGroup(node)) {
    return <EditorGroup group={node} />
  }

  if (isSplitNode(node)) {
    // D4/B19h: controlled Allotment — sizes are written back on change so the
    // recalculated proportions after closing a pane actually take effect
    // (with defaultSizes-only, closing a pane left stale pixel widths).
    return (
      <Allotment
        vertical={node.direction === 'vertical'}
        sizes={node.sizes}
        onChange={(sizes) => {
          dispatch({ type: 'RESIZE_SPLIT', payload: { splitId: node.id, sizes } })
        }}
      >
        {node.children.map((child) => (
          <Allotment.Pane key={child.id} minSize={150}>
            <EditorGroupTree node={child} />
          </Allotment.Pane>
        ))}
      </Allotment>
    )
  }

  return null
}
