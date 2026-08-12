import type { Conversation, ChatNode } from './conversationTree'
import { getAssistantReply, getUserChildren } from './conversationTree'

// ---- Layout Constants ----

export const COL_WIDTH = 220
export const ROW_HEIGHT = 64
export const MARGIN_X = 60
export const MARGIN_Y = 30
export const NODE_RADIUS = 9

// Tidy tree 布局常量
const LEAF_GAP = 180 // 相邻叶子节点水平间距
const GAP = 40 // 子树间最小间距

// ---- Layout Types ----

export interface TreeLayoutNode {
  id: string                  // user node id
  user: ChatNode
  assistant: ChatNode | null
  depth: number
  x: number                   // center x
  y: number                   // center y
  collapsed: boolean
  hasChildren: boolean
  children: TreeLayoutNode[]
}

export interface TreeEdge {
  from: TreeLayoutNode
  to: TreeLayoutNode
}

export interface TreeLayout {
  nodes: TreeLayoutNode[]
  edges: TreeEdge[]
  depth: number
  width: number
  height: number
}

// ---- Tidy Tree Layout ----

interface SubtreeRange {
  minX: number
  maxX: number
}

/**
 * Tidy tree (Reingold-Tilford style):
 * - Root at top center, tree expands downward
 * - y = depth * ROW_HEIGHT
 * - Parent centered above its children
 * - Sibling subtrees laid out independently; if a parent's center would
 *   intrude into the previously laid-out sibling subtree, shift the whole
 *   subtree right to reserve space — branches never overlap.
 */
export function computeTreeLayout(
  conv: Conversation,
  collapsedIds: Set<string>
): TreeLayout {
  // ---- Collect roots ----
  const rootNodes: ChatNode[] = []
  if (conv.rootId && conv.nodes[conv.rootId]) {
    rootNodes.push(conv.nodes[conv.rootId])
  } else {
    const allUserNodes = Object.values(conv.nodes).filter((n) => n.role === 'user')
    for (const n of allUserNodes) {
      if (!n.parentId || !conv.nodes[n.parentId]) rootNodes.push(n)
    }
  }

  const nodes: TreeLayoutNode[] = []
  let cursor = 0 // 叶子节点水平游标
  let maxDepth = 0

  // 构建节点（不含坐标）
  const build = (userNode: ChatNode, depth: number): TreeLayoutNode => {
    const collapsed = collapsedIds.has(userNode.id)
    const children = collapsed ? [] : getUserChildren(conv, userNode.id)
    const layoutNode: TreeLayoutNode = {
      id: userNode.id,
      user: userNode,
      assistant: getAssistantReply(conv, userNode.id),
      depth,
      x: 0,
      y: MARGIN_Y + depth * ROW_HEIGHT,
      collapsed,
      hasChildren: children.length > 0,
      children: [],
    }
    nodes.push(layoutNode)
    maxDepth = Math.max(maxDepth, depth)
    for (const child of children) {
      layoutNode.children.push(build(child, depth + 1))
    }
    return layoutNode
  }

  const builtRoots = rootNodes.map((r) => build(r, 0))

  // 整棵子树右移
  const shiftSubtree = (node: TreeLayoutNode, shift: number) => {
    node.x += shift
    for (const child of node.children) shiftSubtree(child, shift)
  }

  // 子树水平范围（contour）
  const subtreeRange = (node: TreeLayoutNode): SubtreeRange => {
    let minX = node.x
    let maxX = node.x
    for (const child of node.children) {
      const r = subtreeRange(child)
      minX = Math.min(minX, r.minX)
      maxX = Math.max(maxX, r.maxX)
    }
    return { minX, maxX }
  }

  // 后序遍历布局：返回子树范围
  const layout = (node: TreeLayoutNode, prevSiblingMaxX: number): SubtreeRange => {
    if (node.children.length === 0) {
      // 叶子 / 折叠节点：游标分配 x
      node.x = cursor
      cursor += LEAF_GAP
      return { minX: node.x, maxX: node.x }
    }

    // 先布局所有子树，记录每个子树的右侧边界（防重叠）
    let prevMaxX = prevSiblingMaxX
    for (const child of node.children) {
      const range = layout(child, prevMaxX)
      prevMaxX = range.maxX
    }

    // 父节点居中于首尾子节点
    const first = node.children[0]
    const last = node.children[node.children.length - 1]
    node.x = (first.x + last.x) / 2

    // 若居中位置侵入左侧兄弟子树（含间距）→ 整棵子树右移预留
    const ownRange = subtreeRange(node)
    if (node.x < prevSiblingMaxX + GAP) {
      const shift = prevSiblingMaxX + GAP - node.x
      shiftSubtree(node, shift)
      node.x += shift
      return { minX: ownRange.minX + shift, maxX: ownRange.maxX + shift }
    }
    return ownRange
  }

  // 多个根：依次布局（根之间也保持间距）
  let prevMaxX = -Infinity
  for (const root of builtRoots) {
    layout(root, prevMaxX)
    prevMaxX = subtreeRange(root).maxX
  }

  // 整体平移使根居中于画布
  const totalRange = builtRoots.reduce<SubtreeRange>(
    (acc, root) => {
      const r = subtreeRange(root)
      return { minX: Math.min(acc.minX, r.minX), maxX: Math.max(acc.maxX, r.maxX) }
    },
    { minX: Infinity, maxX: -Infinity }
  )
  if (builtRoots.length > 0 && totalRange.minX !== Infinity) {
    const shift = MARGIN_X - totalRange.minX
    for (const root of builtRoots) shiftSubtree(root, shift)
  }

  // ---- Edges ----
  const edges: TreeEdge[] = []
  const walkEdges = (node: TreeLayoutNode) => {
    for (const child of node.children) {
      edges.push({ from: node, to: child })
      walkEdges(child)
    }
  }
  builtRoots.forEach(walkEdges)

  // ---- Bounds ----
  const finalRange = builtRoots.reduce<SubtreeRange>(
    (acc, root) => {
      const r = subtreeRange(root)
      return { minX: Math.min(acc.minX, r.minX), maxX: Math.max(acc.maxX, r.maxX) }
    },
    { minX: Infinity, maxX: -Infinity }
  )
  const width = finalRange.minX === Infinity
    ? MARGIN_X * 2 + LEAF_GAP
    : finalRange.maxX - finalRange.minX + MARGIN_X * 2
  const height = MARGIN_Y + (maxDepth + 1) * ROW_HEIGHT + ROW_HEIGHT

  return { nodes, edges, depth: maxDepth, width, height }
}
