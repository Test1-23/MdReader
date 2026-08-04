import { useCallback } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { useAppContext } from '../../context/AppContext'
import { isEditorGroup, isSplitNode } from '../../types'
import type { LayoutNode } from '../../types'
import { EditorGroup } from './EditorGroup'

interface EditorGroupTreeProps {
  node: LayoutNode
}

export function EditorGroupTree({ node }: EditorGroupTreeProps) {
  const { dispatch } = useAppContext()

  // Handle resize with captured splitId
  const makeResizeHandler = useCallback(
    (splitId: string) => (sizes: number[]) => {
      dispatch({ type: 'RESIZE_SPLIT', payload: { splitId, sizes } })
    },
    [dispatch]
  )

  if (isEditorGroup(node)) {
    return <EditorGroup group={node} />
  }

  if (isSplitNode(node)) {
    return (
      <Allotment
        vertical={node.direction === 'vertical'}
        onChange={makeResizeHandler(node.id)}
        defaultSizes={node.sizes}
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
