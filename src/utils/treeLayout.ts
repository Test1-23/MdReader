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
  // Collect all user nodes that are roots (no parent user node)
  const allUserNodes = Object.values(conv.nodes).filter((n) => n.role === 'user')
  const userNodeIds = new Set(allUserNodes.map((n) => n.id))
  const rootNodes = allUserNodes.filter((n) => {
    // A root user node has no parent, or its parent is not a user node
    return !n.parentId || !userNodeIds.has(n.parentId)
  })

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
        // First child: main chain — down one row, same column
        // Other children: branches — same row as parent, one column right (parallel)
        const childColumn = i === 0 ? column : column + 1
        const childRow = i === 0 ? row + 1 : row
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
