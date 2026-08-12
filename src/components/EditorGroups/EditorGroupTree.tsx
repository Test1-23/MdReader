import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { isEditorGroup, isSplitNode } from '../../types'
import type { LayoutNode } from '../../types'
import { EditorGroup } from './EditorGroup'

interface EditorGroupTreeProps {
  node: LayoutNode
}

export function EditorGroupTree({ node }: EditorGroupTreeProps) {
  if (isEditorGroup(node)) {
    return <EditorGroup group={node} />
  }

  if (isSplitNode(node)) {
    // Allotment 非受控：defaultSizes 只在挂载时应用，拖动由 Allotment 内部管理，
    // 不再通过 onChange 同步到全局 state（分屏拖动零 React 更新）
    return (
      <Allotment
        vertical={node.direction === 'vertical'}
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
