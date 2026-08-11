import type { Conversation, ChatNode } from './conversationTree'
import { getAssistantReply, getUserChildren } from './conversationTree'

// ---- Layout Constants ----

export const COL_WIDTH = 220
export const ROW_HEIGHT = 64
export const MARGIN_X = 60
export const MARGIN_Y = 30
export const NODE_RADIUS = 9

// ---- Layout Types ----

export interface TreeLayoutNode {
  id: string                  // user node id
  user: ChatNode
  assistant: ChatNode | null
  column: number
  row: number
  x: number                   // center x
  y: number                   // center y
  collapsed: boolean
  hasChildren: boolean
  children: TreeLayoutNode[]
}

export interface TreeEdge {
  from: TreeLayoutNode
  to: TreeLayoutNode
  isActive: boolean
}

export interface TreeLayout {
  nodes: TreeLayoutNode[]
  edges: TreeEdge[]
  totalRows: number
  maxColumn: number
  width: number
  height: number
}

// ---- Layout Computation ----

/**
 * Git-graph style layout (parallel branches):
 * - Main chain: first child goes DOWN one row, same column
 * - Branches: other children are placed on the SAME ROW as parent, one column right
 *   (parallel with the main chain, like Git Graph)
 * - Branch's own chain continues down from the branch row
 * - Collapsed nodes skip children
 */
export function computeTreeLayout(
  conv: Conversation,
  activePathIds: Set<string>,
  collapsedIds: Set<string>
): TreeLayout {
  // Single root: conv.rootId points to the first user node.
  // Do NOT treat "parent is an assistant node" as a root — messages sent after
  // backtracking to an AI reply hang under the assistant node and must stay
  // connected to the same tree (getUserChildren flattens that layer).
  const rootNodes: ChatNode[] = []
  if (conv.rootId && conv.nodes[conv.rootId]) {
    rootNodes.push(conv.nodes[conv.rootId])
  } else {
    // Fallback: user nodes with no parent at all
    const allUserNodes = Object.values(conv.nodes).filter((n) => n.role === 'user')
    for (const n of allUserNodes) {
      if (!n.parentId || !conv.nodes[n.parentId]) rootNodes.push(n)
    }
  }

  const result: TreeLayoutNode[] = []
  const edges: TreeEdge[] = []
  const occupied = new Set<string>() // `${column}:${row}` — prevent overlaps
  let maxRow = 0

  const walk = (userNode: ChatNode, column: number, rowHint: number): TreeLayoutNode => {
    const collapsed = collapsedIds.has(userNode.id)
    const children = getUserChildren(conv, userNode.id)
    const assistant = getAssistantReply(conv, userNode.id)

    // If this column/row is occupied, push down until free
    let row = rowHint
    while (occupied.has(`${column}:${row}`)) row++
    occupied.add(`${column}:${row}`)
    maxRow = Math.max(maxRow, row)

    const layoutNode: TreeLayoutNode = {
      id: userNode.id,
      user: userNode,
      assistant,
      column,
      row,
      x: MARGIN_X + column * COL_WIDTH,
      y: MARGIN_Y + row * ROW_HEIGHT,
      collapsed,
      hasChildren: children.length > 0,
      children: [],
    }
    result.push(layoutNode)

    if (!collapsed) {
      children.forEach((child, i) => {
        // All children spread on the SAME row below the parent (columns
        // increment left to right) — multiple children don't stack vertically.
        const childColumn = column + i
        const childRow = row + 1
        const childNode = walk(child, childColumn, childRow)
        layoutNode.children.push(childNode)
        edges.push({
          from: layoutNode,
          to: childNode,
          isActive: activePathIds.has(childNode.id) && activePathIds.has(layoutNode.id),
        })
      })
    }

    return layoutNode
  }

  rootNodes.forEach((root) => {
    walk(root, 0, 0)
  })

  const maxColumn = result.reduce((max, n) => Math.max(max, n.column), 0)

  return {
    nodes: result,
    edges,
    totalRows: maxRow + 1,
    maxColumn,
    width: MARGIN_X + maxColumn * COL_WIDTH + COL_WIDTH,
    height: MARGIN_Y + (maxRow + 1) * ROW_HEIGHT + ROW_HEIGHT,
  }
}
