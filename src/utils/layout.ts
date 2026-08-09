import type { LayoutNode, EditorGroup, SplitNode, TabEntry } from '../types'
import { isEditorGroup } from '../types'

let idCounter = 0

function newId(prefix: string): string {
  return `${prefix}-${++idCounter}-${Math.random().toString(36).slice(2, 7)}`
}

// ---- Create ----

export function createEditorGroup(): EditorGroup {
  return {
    type: 'group',
    id: newId('group'),
    tabs: [],
    activeTabIndex: -1,
  }
}

export function createDefaultLayout(): EditorGroup {
  return createEditorGroup()
}

// ---- Tab Operations ----

export function addTabToGroup(group: EditorGroup, tab: TabEntry): EditorGroup {
  // Check if tab for same file already exists in this group
  const existingIdx = group.tabs.findIndex((t) => t.fileId === tab.fileId)
  if (existingIdx >= 0) {
    return {
      ...group,
      activeTabIndex: existingIdx,
    }
  }

  return {
    ...group,
    tabs: [...group.tabs, tab],
    activeTabIndex: group.tabs.length,
  }
}

export function removeTabFromGroup(group: EditorGroup, tabId: string): EditorGroup | null {
  const newTabs = group.tabs.filter((t) => t.id !== tabId)
  if (newTabs.length === 0) return null

  const removedIdx = group.tabs.findIndex((t) => t.id === tabId)
  let newActiveIdx = group.activeTabIndex
  if (removedIdx === newActiveIdx) {
    newActiveIdx = Math.min(removedIdx, newTabs.length - 1)
  } else if (removedIdx < newActiveIdx) {
    newActiveIdx--
  }

  return {
    ...group,
    tabs: newTabs,
    activeTabIndex: newActiveIdx,
  }
}

export function getActiveTab(group: EditorGroup): TabEntry | null {
  if (group.tabs.length === 0 || group.activeTabIndex < 0) return null
  return group.tabs[group.activeTabIndex] ?? null
}

// ---- Split Operations ----

export function splitGroup(
  root: LayoutNode,
  groupId: string,
  direction: 'horizontal' | 'vertical',
  tabId?: string
): LayoutNode {
  return transformNode(root, groupId, (group) => {
    const newGroup = createEditorGroup()

    // Find which tab to move: specific tabId, or fall back to active tab
    let moveIdx = -1
    if (tabId) {
      moveIdx = group.tabs.findIndex((t) => t.id === tabId)
    }
    if (moveIdx < 0 && group.activeTabIndex >= 0) {
      moveIdx = group.activeTabIndex
    }

    // Move the selected tab to the new group (always create split, allow empty panes)
    if (moveIdx >= 0 && group.tabs.length > 0) {
      const moveTab = group.tabs[moveIdx]
      const remainingTabs = group.tabs.filter((_, i) => i !== moveIdx)
      return {
        type: 'split',
        id: newId('split'),
        direction,
        children: [
          { ...group, tabs: remainingTabs, activeTabIndex: remainingTabs.length > 0 ? 0 : -1 },
          { ...newGroup, tabs: [moveTab], activeTabIndex: 0 },
        ],
        sizes: [50, 50],
      }
    }
    // No tabs to move? Just put a new empty group next to it
    return {
      type: 'split',
      id: newId('split'),
      direction,
      children: [group, newGroup],
      sizes: [50, 50],
    }
  })
}

// ---- Split With Tab (atomic move + split) ----

export function splitWithTab(
  root: LayoutNode,
  tabId: string,
  fromGroupId: string,
  toGroupId: string,
  direction: 'horizontal' | 'vertical'
): LayoutNode {
  let tabToMove: TabEntry | null = null

  // Step 1: Remove tab from source group
  const afterRemove = transformNode(root, fromGroupId, (group) => {
    const idx = group.tabs.findIndex((t) => t.id === tabId)
    if (idx < 0) return group
    tabToMove = { ...group.tabs[idx] }
    const newTabs = group.tabs.filter((t) => t.id !== tabId)
    let newActiveIdx = group.activeTabIndex
    if (idx === newActiveIdx) {
      newActiveIdx = Math.min(idx, newTabs.length - 1)
    } else if (idx < newActiveIdx) {
      newActiveIdx--
    }
    return { ...group, tabs: newTabs, activeTabIndex: newActiveIdx }
  })

  if (!tabToMove) return root

  // Step 2: Clean up empty source group
  let cleaned = afterRemove
  const sourceGroup = findGroup(afterRemove, fromGroupId)
  if (sourceGroup && sourceGroup.tabs.length === 0) {
    cleaned = removeNode(afterRemove, fromGroupId)
  }

  // Step 3: Split destination group, putting the moved tab in the new pane
  return transformNode(cleaned, toGroupId, (group) => {
    const newGroup = createEditorGroup()
    return {
      type: 'split',
      id: newId('split'),
      direction,
      children: [
        group,
        { ...newGroup, tabs: [tabToMove!], activeTabIndex: 0 },
      ],
      sizes: [50, 50],
    }
  })
}

// ---- Promote Sibling (close group → lift sibling) ----

function replaceNode(root: LayoutNode, targetId: string, replacement: LayoutNode): LayoutNode {
  if (isEditorGroup(root)) return root.id === targetId ? replacement : root
  const split = root as SplitNode
  if (split.id === targetId) return replacement
  return { ...split, children: split.children.map((c) => replaceNode(c, targetId, replacement)) }
}

export function promoteSibling(root: LayoutNode, groupId: string): LayoutNode {
  const parentSplit = findParentSplit(root, groupId)
  if (!parentSplit) return removeNode(root, groupId)

  const siblings = parentSplit.children.filter((c) => c.id !== groupId)
  if (siblings.length === 0) return removeNode(root, groupId)

  // Only one sibling → lift it to the parent Split's position
  if (siblings.length === 1) {
    return replaceNode(root, parentSplit.id, siblings[0])
  }

  // Multiple siblings → keep the Split, just remove the target group
  return removeNode(root, groupId)
}

// ---- Split With File (atomic OPEN + SPLIT) ----

export function splitWithFile(
  root: LayoutNode,
  targetGroupId: string,
  tab: TabEntry,
  direction: 'horizontal' | 'vertical'
): LayoutNode {
  return transformNode(root, targetGroupId, (group) => {
    const newGroup = createEditorGroup()

    // Dedup: if file already open in this group, move the existing tab
    const existingIdx = group.tabs.findIndex((t) => t.fileId === tab.fileId)
    if (existingIdx >= 0) {
      const existingTab = group.tabs[existingIdx]
      const remainingTabs = group.tabs.filter((_, i) => i !== existingIdx)
      return {
        type: 'split', id: newId('split'), direction,
        children: [
          { ...group, tabs: remainingTabs, activeTabIndex: remainingTabs.length > 0 ? 0 : -1 },
          { ...newGroup, tabs: [existingTab], activeTabIndex: 0 },
        ],
        sizes: [50, 50],
      }
    }

    // New file: add to group then move the new tab to the new pane
    const withTab = addTabToGroup(group, tab)
    const activeTab = getActiveTab(withTab)
    if (!activeTab) return group
    const remainingTabs = withTab.tabs.filter((t) => t.id !== activeTab.id)
    return {
      type: 'split', id: newId('split'), direction,
      children: [
        { ...group, tabs: remainingTabs, activeTabIndex: remainingTabs.length > 0 ? 0 : -1 },
        { ...newGroup, tabs: [activeTab], activeTabIndex: 0 },
      ],
      sizes: [50, 50],
    }
  })
}

// ---- Move Tab Operations ----

export function moveTab(
  root: LayoutNode,
  tabId: string,
  fromGroupId: string,
  toGroupId: string,
  toIndex: number
): LayoutNode {
  // First, find and remove the tab from the source group
  let tabToMove: TabEntry | null = null
  let removedIdx = -1

  const afterRemove = transformNode(root, fromGroupId, (group) => {
    const idx = group.tabs.findIndex((t) => t.id === tabId)
    if (idx < 0) return group
    removedIdx = idx
    tabToMove = { ...group.tabs[idx] }
    const newTabs = group.tabs.filter((t) => t.id !== tabId)
    let newActiveIdx = group.activeTabIndex
    if (idx === newActiveIdx) {
      newActiveIdx = Math.min(idx, newTabs.length - 1)
    } else if (idx < newActiveIdx) {
      newActiveIdx--
    }
    return {
      ...group,
      tabs: newTabs,
      activeTabIndex: newActiveIdx,
    }
  })

  if (!tabToMove) return root

  // Clean up the source group if it's now empty after removing the tab
  const sourceGroup = findGroup(afterRemove, fromGroupId)
  let cleanedLayout = afterRemove
  if (sourceGroup && sourceGroup.tabs.length === 0) {
    cleanedLayout = removeNode(afterRemove, fromGroupId)
  }

  // Adjust toIndex for same-group moves: after removal, indices shift left
  let adjustedIndex = toIndex
  if (fromGroupId === toGroupId && removedIdx >= 0 && toIndex > removedIdx) {
    adjustedIndex = toIndex - 1
  }

  // Then insert into destination group
  return transformNode(cleanedLayout, toGroupId, (group) => {
    const newTabs = [...group.tabs]
    const insertIdx = Math.min(adjustedIndex, newTabs.length)
    newTabs.splice(insertIdx, 0, tabToMove!)
    return {
      ...group,
      tabs: newTabs,
      activeTabIndex: insertIdx,
    }
  })
}

// ---- Close Group ----

export function closeGroup(root: LayoutNode, groupId: string): LayoutNode {
  return removeNode(root, groupId)
}

// ---- Resize Split ----

export function resizeSplit(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  return transformSplit(root, splitId, (split) => ({
    ...split,
    sizes,
  }))
}

// ---- Layout Tree Helpers ----

export function transformNode(
  node: LayoutNode,
  targetId: string,
  fn: (group: EditorGroup) => LayoutNode
): LayoutNode {
  if (isEditorGroup(node)) {
    if (node.id === targetId) {
      return fn(node)
    }
    return node
  }

  // SplitNode
  const split = node as SplitNode
  if (split.id === targetId) {
    // Can't transform a split node with group transform
    return node
  }

  return {
    ...split,
    children: split.children.map((child) => transformNode(child, targetId, fn)),
  }
}

function transformSplit(
  node: LayoutNode,
  targetId: string,
  fn: (split: SplitNode) => SplitNode
): LayoutNode {
  if (isEditorGroup(node)) return node

  const split = node as SplitNode
  if (split.id === targetId) {
    return fn(split)
  }

  return {
    ...split,
    children: split.children.map((child) => transformSplit(child, targetId, fn)),
  }
}

function removeNode(node: LayoutNode, targetId: string): LayoutNode {
  if (isEditorGroup(node)) {
    // Can't remove the last group - return it empty
    return { ...node, tabs: [], activeTabIndex: -1 }
  }

  const split = node as SplitNode
  const newChildren = split.children
    .map((child) => {
      if (isEditorGroup(child) && child.id === targetId) {
        return null // Mark for removal
      }
      if (!isEditorGroup(child)) {
        return removeNode(child, targetId)
      }
      return child
    })
    .filter(Boolean) as LayoutNode[]

  // Don't collapse — keep the Split structure even with 1 child
  // Recalculate sizes proportionally for remaining children
  const remainingSize = split.sizes.reduce((sum, size, i) => {
    return split.children[i]?.id === targetId ? sum : sum + size
  }, 0)

  const newSizes = newChildren.map((child) => {
    const origIdx = split.children.findIndex((c) => c.id === child.id)
    const origSize = split.sizes[origIdx] ?? 0
    return remainingSize > 0 ? Math.round((origSize / remainingSize) * 100) : Math.round(100 / newChildren.length)
  })

  return {
    ...split,
    children: newChildren,
    sizes: newSizes,
  }
}

// ---- Find Operations ----

export function findGroup(root: LayoutNode, groupId: string): EditorGroup | null {
  if (isEditorGroup(root)) {
    return root.id === groupId ? root : null
  }

  const split = root as SplitNode
  for (const child of split.children) {
    const found = findGroup(child, groupId)
    if (found) return found
  }
  return null
}

export function findGroupContainingTab(root: LayoutNode, tabId: string): EditorGroup | null {
  if (isEditorGroup(root)) {
    return root.tabs.some((t) => t.id === tabId) ? root : null
  }

  const split = root as SplitNode
  for (const child of split.children) {
    const found = findGroupContainingTab(child, tabId)
    if (found) return found
  }
  return null
}

export function findParentSplit(root: LayoutNode, childId: string): SplitNode | null {
  if (isEditorGroup(root)) return null

  const split = root as SplitNode
  for (const child of split.children) {
    if (child.id === childId) return split
    if (!isEditorGroup(child)) {
      const found = findParentSplit(child, childId)
      if (found) return found
    }
  }
  return null
}

export function getFirstGroup(root: LayoutNode): EditorGroup | null {
  if (isEditorGroup(root)) return root
  const split = root as SplitNode
  if (split.children.length === 0) return null
  return getFirstGroup(split.children[0])
}
