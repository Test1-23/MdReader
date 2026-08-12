import type { LayoutNode, EditorGroup, SplitNode, SplitPosition, TabEntry } from '../types'
import { isEditorGroup } from '../types'
import { createId } from './fileReader'

function posDir(p: SplitPosition): 'horizontal' | 'vertical' {
  return p === 'top' || p === 'bottom' ? 'vertical' : 'horizontal'
}
function posNewFirst(p: SplitPosition): boolean {
  return p === 'left' || p === 'top'
}

// E8: unified id factory
function newId(prefix: string): string {
  return createId(prefix)
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

// E4: the single "remove a tab + adjust activeTabIndex" implementation.
// B8: a tabId that isn't in this group returns null instead of corrupting
// activeTabIndex (removedIdx = -1 used to decrement the active index).
export function removeTabById(
  group: EditorGroup,
  tabId: string
): { group: EditorGroup; removed: TabEntry } | null {
  const removedIdx = group.tabs.findIndex((t) => t.id === tabId)
  if (removedIdx < 0) return null

  const removed = group.tabs[removedIdx]
  const newTabs = group.tabs.filter((t) => t.id !== tabId)
  if (newTabs.length === 0) {
    return { group: { ...group, tabs: [], activeTabIndex: -1 }, removed }
  }

  let newActiveIdx = group.activeTabIndex
  if (removedIdx === newActiveIdx) {
    newActiveIdx = Math.min(removedIdx, newTabs.length - 1)
  } else if (removedIdx < newActiveIdx) {
    newActiveIdx--
  }

  return {
    group: { ...group, tabs: newTabs, activeTabIndex: newActiveIdx },
    removed,
  }
}

// Legacy contract: null means "group became empty" (caller promotes the sibling).
// B8: a tab that isn't in the group returns the group UNCHANGED (never a
// corrupted activeTabIndex, never an accidental group removal).
export function removeTabFromGroup(group: EditorGroup, tabId: string): EditorGroup | null {
  const result = removeTabById(group, tabId)
  if (!result) return group
  return result.group.tabs.length === 0 ? null : result.group
}

export function getActiveTab(group: EditorGroup): TabEntry | null {
  if (group.tabs.length === 0 || group.activeTabIndex < 0) return null
  return group.tabs[group.activeTabIndex] ?? null
}

// ---- Split Construction (E5) ----

// 把 movedTab 放进新 pane，与原组构成一对 split（splitGroup / splitWithFile 共用）
function makeSplitPair(origGroup: EditorGroup, movedTab: TabEntry, position: SplitPosition): SplitNode {
  const direction = posDir(position)
  const newGroupFirst = posNewFirst(position)
  const newPane: EditorGroup = { ...createEditorGroup(), tabs: [movedTab], activeTabIndex: 0 }
  return {
    type: 'split',
    id: newId('split'),
    direction,
    children: newGroupFirst ? [newPane, origGroup] : [origGroup, newPane],
    sizes: [50, 50],
  }
}

// ---- Split Operations ----

export function splitGroup(
  root: LayoutNode,
  groupId: string,
  position: SplitPosition,
  tabId?: string
): LayoutNode {
  return transformNode(root, groupId, (group) => {
    // Find which tab to move: specific tabId, or fall back to active tab
    let moveIdx = -1
    if (tabId) {
      moveIdx = group.tabs.findIndex((t) => t.id === tabId)
    }
    if (moveIdx < 0 && group.activeTabIndex >= 0) {
      moveIdx = group.activeTabIndex
    }

    // B20b: guard against out-of-range indices (corrupted/restored state)
    if (moveIdx < 0 || moveIdx >= group.tabs.length) {
      // No tab to move → put a new empty group next to it
      const direction = posDir(position)
      const newGroupFirst = posNewFirst(position)
      const newGroup = createEditorGroup()
      return {
        type: 'split',
        id: newId('split'),
        direction,
        children: newGroupFirst ? [newGroup, group] : [group, newGroup],
        sizes: [50, 50],
      }
    }

    // Move the selected tab to the new group (always create split, allow empty panes)
    const moveTab = group.tabs[moveIdx]
    const remainingTabs = group.tabs.filter((_, i) => i !== moveIdx)
    const origPane = { ...group, tabs: remainingTabs, activeTabIndex: remainingTabs.length > 0 ? 0 : -1 }
    return makeSplitPair(origPane, moveTab, position)
  })
}

// ---- Split With Tab (atomic move + split) ----

export function splitWithTab(
  root: LayoutNode,
  tabId: string,
  fromGroupId: string,
  toGroupId: string,
  position: SplitPosition
): LayoutNode {
  let tabToMove: TabEntry | null = null
  let sourceEmptied = false

  // Step 1: Remove tab from source group (single traversal — P8)
  const afterRemove = transformNode(root, fromGroupId, (group) => {
    const result = removeTabById(group, tabId)
    if (!result) return group
    tabToMove = result.removed
    sourceEmptied = result.group.tabs.length === 0
    return result.group
  })

  if (!tabToMove) return root

  // Step 2: Clean up empty source group (only if different from destination)
  let cleaned = afterRemove
  if (fromGroupId !== toGroupId && sourceEmptied) {
    cleaned = removeNode(afterRemove, fromGroupId)
  }

  // Step 3: Split destination group, putting the moved tab in the new pane
  return transformNode(cleaned, toGroupId, (group) => {
    // B9: the target group must not end up with two tabs for one file —
    // activate the existing tab instead of duplicating it
    const existingIdx = group.tabs.findIndex((t) => t.fileId === tabToMove!.fileId)
    if (existingIdx >= 0) {
      return { ...group, activeTabIndex: existingIdx }
    }
    return makeSplitPair(group, tabToMove!, position)
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
  position: SplitPosition
): LayoutNode {
  return transformNode(root, targetGroupId, (group) => {
    // Dedup: if file already open in this group, move the existing tab
    const existingIdx = group.tabs.findIndex((t) => t.fileId === tab.fileId)
    if (existingIdx >= 0) {
      const existingTab = group.tabs[existingIdx]
      const remainingTabs = group.tabs.filter((_, i) => i !== existingIdx)
      const origPane = { ...group, tabs: remainingTabs, activeTabIndex: remainingTabs.length > 0 ? 0 : -1 }
      return makeSplitPair(origPane, existingTab, position)
    }

    // New file: add to group then move the new tab to the new pane
    const withTab = addTabToGroup(group, tab)
    const activeTab = getActiveTab(withTab)
    if (!activeTab) return group
    const remainingTabs = withTab.tabs.filter((t) => t.id !== activeTab.id)
    const origPane = { ...group, tabs: remainingTabs, activeTabIndex: remainingTabs.length > 0 ? 0 : -1 }
    return makeSplitPair(origPane, activeTab, position)
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
  // First, find and remove the tab from the source group (single traversal — P8)
  let tabToMove: TabEntry | null = null
  let removedIdx = -1
  let sourceEmptied = false

  const afterRemove = transformNode(root, fromGroupId, (group) => {
    const idx = group.tabs.findIndex((t) => t.id === tabId)
    if (idx < 0) return group
    const result = removeTabById(group, tabId)!
    removedIdx = idx
    tabToMove = result.removed
    sourceEmptied = result.group.tabs.length === 0
    return result.group
  })

  if (!tabToMove) return root

  // Clean up the source group if it's now empty (only if different from destination)
  let cleanedLayout = afterRemove
  if (fromGroupId !== toGroupId && sourceEmptied) {
    cleanedLayout = removeNode(afterRemove, fromGroupId)
  }

  // Adjust toIndex for same-group moves: after removal, indices shift left
  let adjustedIndex = toIndex
  if (fromGroupId === toGroupId && removedIdx >= 0 && toIndex > removedIdx) {
    adjustedIndex = toIndex - 1
  }

  // Then insert into destination group
  return transformNode(cleanedLayout, toGroupId, (group) => {
    // B9: activate instead of duplicating when the file is already in the target group
    const existingIdx = group.tabs.findIndex((t) => t.fileId === tabToMove!.fileId)
    if (existingIdx >= 0) {
      return { ...group, activeTabIndex: existingIdx }
    }
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

// B10: removing a group inside a nested split must not leave a ghost pane.
// Children that disappear contribute nothing; the remaining sizes are
// re-normalized (B20e). When an inner split loses all children it is removed
// entirely, and the caller re-normalizes — no zero-width replacement groups.
function removeNodeInternal(node: LayoutNode, targetId: string): LayoutNode | null {
  if (isEditorGroup(node)) {
    if (node.id === targetId) return null
    // Direct call on a non-matching group root — keep the group but empty it
    return { ...node, tabs: [], activeTabIndex: -1 }
  }

  const split = node as SplitNode
  const kept: LayoutNode[] = []
  const keptSizes: number[] = []
  split.children.forEach((child, i) => {
    if (isEditorGroup(child)) {
      if (child.id === targetId) return // removed — its size is dropped
      kept.push(child)
      keptSizes.push(split.sizes[i] ?? 0)
    } else {
      const result = removeNodeInternal(child, targetId)
      if (result === null) return // whole subtree removed
      kept.push(result)
      keptSizes.push(split.sizes[i] ?? 0)
    }
  })

  if (kept.length === 0) return null

  // B20e: normalize remaining sizes to sum 100
  const total = keptSizes.reduce((a, b) => a + b, 0)
  const sizes = total > 0
    ? keptSizes.map((s) => Math.round((s / total) * 100))
    : kept.map(() => Math.round(100 / kept.length))

  return { ...split, children: kept, sizes }
}

function removeNode(node: LayoutNode, targetId: string): LayoutNode {
  return removeNodeInternal(node, targetId) ?? createEditorGroup()
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

// E15: predicate-based group finder — tab/fileId lookups are the same walk
export function findGroupWhere(
  root: LayoutNode,
  predicate: (tab: TabEntry) => boolean
): EditorGroup | null {
  if (isEditorGroup(root)) {
    return root.tabs.some(predicate) ? root : null
  }

  const split = root as SplitNode
  for (const child of split.children) {
    const found = findGroupWhere(child, predicate)
    if (found) return found
  }
  return null
}

export function findGroupContainingTab(root: LayoutNode, tabId: string): EditorGroup | null {
  return findGroupWhere(root, (t) => t.id === tabId)
}

export function findGroupContainingFileId(root: LayoutNode, fileId: string): EditorGroup | null {
  return findGroupWhere(root, (t) => t.fileId === fileId)
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

export function collectAllTabs(node: LayoutNode): TabEntry[] {
  if (isEditorGroup(node)) return [...node.tabs]
  return (node as SplitNode).children.flatMap(collectAllTabs)
}

// ---- Invariants (R3) ----

// The "validate→apply→validate" loop's second pass. Returns violations (empty = healthy).
// Checks: sizes/children length, activeTabIndex bounds, per-group fileId uniqueness,
// zero-child splits, and that activeGroupId/activeTabId point into the tree.
export function assertLayoutInvariants(
  root: LayoutNode | null,
  activeGroupId: string | null,
  activeTabId: string | null
): string[] {
  const problems: string[] = []
  if (!root) return problems

  const groupIds = new Set<string>()
  const tabIds = new Set<string>()
  const walk = (node: LayoutNode): void => {
    if (isEditorGroup(node)) {
      groupIds.add(node.id)
      if (node.activeTabIndex < -1 || node.activeTabIndex >= node.tabs.length) {
        problems.push(`group ${node.id}: activeTabIndex ${node.activeTabIndex} out of range [0, ${node.tabs.length})`)
      }
      const fileIds = new Set<string>()
      for (const t of node.tabs) {
        tabIds.add(t.id)
        if (fileIds.has(t.fileId)) problems.push(`group ${node.id}: duplicate fileId ${t.fileId}`)
        fileIds.add(t.fileId)
      }
    } else {
      const split = node as SplitNode
      if (split.children.length === 0) problems.push(`split ${split.id}: no children`)
      if (split.sizes.length !== split.children.length) {
        problems.push(`split ${split.id}: sizes ${split.sizes.length} ≠ children ${split.children.length}`)
      }
      split.children.forEach(walk)
    }
  }
  walk(root)

  if (activeGroupId && !groupIds.has(activeGroupId)) {
    problems.push(`activeGroupId ${activeGroupId} not in tree`)
  }
  if (activeTabId && !tabIds.has(activeTabId)) {
    problems.push(`activeTabId ${activeTabId} not in tree`)
  }
  return problems
}
