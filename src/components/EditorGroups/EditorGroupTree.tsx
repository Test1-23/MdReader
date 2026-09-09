import { memo } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'
import { isEditorGroup, isSplitNode } from '../../types'
import type { LayoutNode } from '../../types'
import { useLayoutDispatch } from '../../context/AppContext'
import { EditorGroup } from './EditorGroup'

interface EditorGroupTreeProps {
  node: LayoutNode
  /** 根节点始终包一层横向 Allotment —— 单文档根从 group 变 split 时元素类型不翻转，
   *  React 因而不会卸载/重挂载存活文档（打开 AI 窗口的场景） */
  isRoot?: boolean
}

/**
 * memo：mapTree 会保留未受影响子树的 node 引用，因此 UI 状态（拖拽、侧栏、
 * 设置…）引发的重渲染会止步于编辑器边界。
 *
 * 已知取舍：新面板是"追加"进已有 split 的（不换 split id → 不重挂载 → 不重新
 * 解析文档），allotment 会把新面板按均分处理，因此打开 AI 窗口时分栏为 50/50
 * 而非 70/30。用户拖动 sash 后的比例会经 onDragEnd 写回树，后续操作保持。
 * （allotment 1.20.5 的 preferredSize 在 add 路径只认像素数值；命令式 resize
 * 在视图登记完成前会抛错，故不采用。）
 */
export const EditorGroupTree = memo(function EditorGroupTree({ node, isRoot = false }: EditorGroupTreeProps) {
  const dispatch = useLayoutDispatch()

  if (isEditorGroup(node)) {
    if (!isRoot) return <EditorGroup group={node} />
    // key 与横向 split 分支保持一致，且 pane 子元素也必须是 <EditorGroupTree>
    // （与 split 分支一致）—— 否则单文档根变横向分屏时 React 会因元素类型
    // 变化而卸载重挂载存活文档
    return (
      <Allotment key="horizontal">
        <Allotment.Pane key={node.id} minSize={150}>
          <EditorGroupTree node={node} />
        </Allotment.Pane>
      </Allotment>
    )
  }

  if (isSplitNode(node)) {
    return (
      <Allotment
        // 方向被 allotment 固化在挂载时 —— key 随方向变化，方向变了才重挂载
        key={isRoot ? node.direction : undefined}
        vertical={node.direction === 'vertical'}
        // allotment 1.20.5: sizes 已废弃且只在挂载时读取一次（别名 defaultSizes）；
        // 用 defaultSizes 消除 dev 弃用警告，语义一致
        defaultSizes={node.sizes}
        onDragEnd={(sizes) => {
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
})
