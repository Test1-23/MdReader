import type { Conversation, ChatNode } from './conversationTree'
import { getAssistantReply, getUserChildren } from './conversationTree'

// ---- Layout Constants ----

export const COL_WIDTH = 220
export const ROW_HEIGHT = 64
export const MARGIN_X = 60
export const MARGIN_Y = 30
export const NODE_RADIUS = 9

// Tidy tree 布局常量
const LEAF_GAP = 120 // 相邻叶子节点水平间距

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

// ---- Tidy Tree Layout (Reingold–Tilford, O(n)) ----

// R5: standard two-pass tidy tree with contour separation. The previous
// implementation used a global leaf cursor (branches never overlapped but
// wasted large horizontal spans, and its anti-overlap branch was dead code
// containing a double-shift bug). This version:
//   - first walk (post-order): place sibling subtrees against each other's
//     right/left contours with LEAF_GAP separation, center each parent above
//     its first and last child
//   - second walk (pre-order): accumulate offsets into absolute x
// Contour merging costs O(total contour length) = O(n) for the shapes
// conversation trees take (chains, stars, binary trees).

interface WalkNode {
  layoutNode: TreeLayoutNode
  children: WalkNode[]
  rootX: number          // x of this node within its parent's frame
  left: number[]         // left contour, root-relative (left[0] === 0)
  right: number[]        // right contour, root-relative
}

function firstWalk(node: WalkNode): void {
  if (node.children.length === 0) {
    node.rootX = 0
    node.left = [0]
    node.right = [0]
    return
  }

  const childRootXs: number[] = []
  let mergedLeft: number[] = []
  let mergedRight: number[] = []

  node.children.forEach((child, i) => {
    firstWalk(child)
    let offset: number
    if (i === 0) {
      offset = 0
    } else {
      // separate this subtree from everything placed so far at every depth
      offset = -Infinity
      const dMax = Math.max(mergedRight.length, child.left.length)
      for (let d = 0; d < dMax; d++) {
        const r = mergedRight[d] ?? -Infinity
        const l = child.left[d] ?? 0
        offset = Math.max(offset, r - l + LEAF_GAP)
      }
    }

    const absLeft = child.left.map((x) => x + offset)
    const absRight = child.right.map((x) => x + offset)
    child.rootX = offset // position of this child within the parent's frame
    childRootXs.push(offset)

    for (let d = 0; d < absLeft.length; d++) {
      mergedLeft[d] = d < mergedLeft.length ? Math.min(mergedLeft[d], absLeft[d]) : absLeft[d]
    }
    for (let d = 0; d < absRight.length; d++) {
      mergedRight[d] = d < mergedRight.length ? Math.max(mergedRight[d], absRight[d]) : absRight[d]
    }
  })

  // center the parent above its first and last child roots: shift every child
  // by -prelim so the children are symmetric around the parent (the classic
  // RT "mod" adjustment, expressed through offsets)
  const prelim = (childRootXs[0] + childRootXs[childRootXs.length - 1]) / 2
  for (const child of node.children) child.rootX -= prelim
  node.left = [0, ...mergedLeft.map((x) => x - prelim)]
  node.right = [0, ...mergedRight.map((x) => x - prelim)]
}

function secondWalk(node: WalkNode, x: number): void {
  node.layoutNode.x = x
  for (const child of node.children) {
    secondWalk(child, x + child.rootX)
  }
}

/**
 * Tidy tree (Reingold-Tilford style):
 * - Root at top center, tree expands downward
 * - y = depth * ROW_HEIGHT
 * - Parent centered above its children
 * - Sibling subtrees separated by contour merging — branches never overlap,
 *   and a linear conversation renders as a straight vertical column.
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

  const toWalk = (layoutNode: TreeLayoutNode): WalkNode => ({
    layoutNode,
    children: layoutNode.children.map(toWalk),
    rootX: 0,
    left: [],
    right: [],
  })

  const builtRoots = rootNodes.map((r) => build(r, 0))

  // ---- Multi-root: a virtual super-root holds the roots side by side ----
  const virtualRoot: WalkNode = {
    layoutNode: null as unknown as TreeLayoutNode, // never walked in second pass
    children: builtRoots.map(toWalk),
    rootX: 0,
    left: [],
    right: [],
  }

  if (virtualRoot.children.length > 0) {
    firstWalk(virtualRoot)
    // the virtual root's children are the real roots — apply absolute positions
    for (const child of virtualRoot.children) {
      secondWalk(child, child.rootX)
    }
    // shift the whole drawing to the right margin
    let minX = Infinity
    for (const layoutNode of nodes) {
      minX = Math.min(minX, layoutNode.x)
    }
    if (minX !== Infinity) {
      const shift = MARGIN_X - minX
      for (const layoutNode of nodes) layoutNode.x += shift
    }
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
  let minX = Infinity
  let maxX = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    maxX = Math.max(maxX, n.x)
  }
  const width = nodes.length === 0
    ? MARGIN_X * 2 + LEAF_GAP
    : maxX - minX + MARGIN_X * 2
  const height = MARGIN_Y + (maxDepth + 1) * ROW_HEIGHT + ROW_HEIGHT

  return { nodes, edges, depth: maxDepth, width, height }
}
