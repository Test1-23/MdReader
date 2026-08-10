import type { AppState, LayoutNode, OpenFile, TabEntry, SplitNode } from '../types'
import { isEditorGroup, isSplitNode } from '../types'
import {
  findGroup,
  findGroupContainingTab,
  getFirstGroup,
  getActiveTab,
  createDefaultLayout,
  addTabToGroup,
  removeTabFromGroup,
  transformNode,
  splitGroup,
  splitWithTab,
  splitWithFile,
  moveTab,
  promoteSibling,
} from '../utils/layout'

// ---- Operation Types ----

type Direction = 'horizontal' | 'vertical'

export type LayoutOperation =
  | { type: 'OPEN_FILE'; file: OpenFile; tabId: string; groupId?: string }
  | { type: 'OPEN_AND_SPLIT'; file: OpenFile; tabId: string; groupId: string; direction: Direction }
  | { type: 'SPLIT_GROUP'; groupId: string; direction: Direction; tabId?: string }
  | { type: 'SPLIT_WITH_TAB'; tabId: string; fromGroupId: string; toGroupId: string; direction: Direction }
  | { type: 'MOVE_TAB'; tabId: string; fromGroupId: string; toGroupId: string; toIndex: number }
  | { type: 'CLOSE_TAB'; groupId: string; tabId: string }
  | { type: 'CLOSE_GROUP'; groupId: string }

export interface LayoutResult {
  layoutRoot: LayoutNode | null
  activeGroupId: string | null
  activeTabId: string | null
  openFilesToAdd: Record<string, OpenFile>
  openFilesToRemove: string[]
}

// ---- Helpers ----

function collectAllTabs(node: LayoutNode): TabEntry[] {
  if (isEditorGroup(node)) return [...node.tabs]
  return (node as SplitNode).children.flatMap(collectAllTabs)
}

function isCorrupted(root: LayoutNode | null): boolean {
  if (!root) return false
  if (isSplitNode(root) && root.children.length === 0) return true
  if (isSplitNode(root)) return root.children.some((c) => isCorrupted(c))
  return false
}

function noChange(state: AppState): LayoutResult {
  return {
    layoutRoot: state.layoutRoot,
    activeGroupId: state.activeGroupId,
    activeTabId: state.activeTabId,
    openFilesToAdd: {},
    openFilesToRemove: [],
  }
}

function rebuild(state: AppState): LayoutResult {
  return {
    layoutRoot: null,
    activeGroupId: null,
    activeTabId: null,
    openFilesToRemove: Object.keys(state.openFiles),
    openFilesToAdd: {},
  }
}

// ---- Validation ----

function validate(_state: AppState, op: LayoutOperation): string | null {
  const root = _state.layoutRoot

  if (op.type === 'OPEN_FILE') {
    if (op.groupId && root && !findGroup(root, op.groupId)) {
      return `Group not found: ${op.groupId}`
    }
    return null
  }

  if (!root) return 'No layout root'

  switch (op.type) {
    case 'OPEN_AND_SPLIT':
      return findGroup(root, op.groupId) ? null : `Group not found: ${op.groupId}`
    case 'SPLIT_GROUP':
      return findGroup(root, op.groupId) ? null : `Group not found: ${op.groupId}`
    case 'SPLIT_WITH_TAB':
      if (!findGroupContainingTab(root, op.tabId)) return `Tab not found: ${op.tabId}`
      if (!findGroup(root, op.toGroupId)) return `Target group not found: ${op.toGroupId}`
      return null
    case 'MOVE_TAB':
      if (!findGroupContainingTab(root, op.tabId)) return `Tab not found: ${op.tabId}`
      if (!findGroup(root, op.toGroupId)) return `Target group not found: ${op.toGroupId}`
      return null
    case 'CLOSE_TAB':
      return findGroup(root, op.groupId) ? null : `Group not found: ${op.groupId}`
    case 'CLOSE_GROUP':
      return findGroup(root, op.groupId) ? null : `Group not found: ${op.groupId}`
    default:
      return null
  }
}

// ---- Central Executor ----

export function execute(
  state: AppState,
  operation: LayoutOperation
): LayoutResult {
  const validationError = validate(state, operation)
  if (validationError) {
    console.error(`[layoutService] Validation failed — ${validationError}`, operation)
    return noChange(state)
  }

  let result: LayoutResult
  try {
    result = apply(state, operation)
  } catch (err) {
    console.error('[layoutService] Unexpected error during apply:', err, operation)
    return rebuild(state)
  }

  if (isCorrupted(result.layoutRoot)) {
    console.error('[layoutService] Tree corrupted after operation — rebuilding', operation)
    return rebuild(state)
  }

  return result
}

// ---- Apply ----

function apply(state: AppState, op: LayoutOperation): LayoutResult {
  switch (op.type) {
    case 'OPEN_FILE':         return handleOpenFile(state, op)
    case 'OPEN_AND_SPLIT':    return handleOpenAndSplit(state, op)
    case 'SPLIT_GROUP':       return handleSplitGroup(state, op)
    case 'SPLIT_WITH_TAB':    return handleSplitWithTab(state, op)
    case 'MOVE_TAB':          return handleMoveTab(state, op)
    case 'CLOSE_TAB':         return handleCloseTab(state, op)
    case 'CLOSE_GROUP':       return handleCloseGroup(state, op)
  }
}

// ---- OPEN_FILE ----

function handleOpenFile(
  state: AppState,
  op: LayoutOperation & { type: 'OPEN_FILE' }
): LayoutResult {
  const { file, tabId, groupId: targetGroupId } = op
  let layout = state.layoutRoot || createDefaultLayout()

  const effectiveGroupId = targetGroupId || state.activeGroupId || getFirstGroup(layout)?.id || ''
  let targetGroup = findGroup(layout, effectiveGroupId)

  if (!targetGroup) {
    const fallback = getFirstGroup(layout)
    if (!fallback) {
      // Tree has no valid group — rebuild
      layout = createDefaultLayout()
      targetGroup = getFirstGroup(layout)!
    } else {
      targetGroup = fallback
    }
  }

  const tab: TabEntry = {
    id: tabId, fileId: file.fileId, filePath: file.filePath,
    fileName: file.fileName, viewMode: 'preview',
  }
  const updatedGroup = addTabToGroup(targetGroup, tab)
  layout = transformNode(layout, targetGroup.id, () => updatedGroup)

  return {
    layoutRoot: layout,
    activeGroupId: targetGroup.id,
    activeTabId: updatedGroup.tabs[updatedGroup.activeTabIndex]?.id ?? tabId,
    openFilesToAdd: { [file.fileId]: file },
    openFilesToRemove: [],
  }
}

// ---- OPEN_AND_SPLIT ----

function handleOpenAndSplit(
  state: AppState,
  op: LayoutOperation & { type: 'OPEN_AND_SPLIT' }
): LayoutResult {
  const { file, tabId, groupId, direction } = op
  const tab: TabEntry = {
    id: tabId, fileId: file.fileId, filePath: file.filePath,
    fileName: file.fileName, viewMode: 'preview',
  }
  const newLayout = splitWithFile(state.layoutRoot!, groupId, tab, direction)
  const newGroup = findGroupContainingTab(newLayout, tabId)

  return {
    layoutRoot: newLayout,
    activeGroupId: newGroup?.id ?? groupId,
    activeTabId: tabId,
    openFilesToAdd: { [file.fileId]: file },
    openFilesToRemove: [],
  }
}

// ---- SPLIT_GROUP ----

function handleSplitGroup(
  state: AppState,
  op: LayoutOperation & { type: 'SPLIT_GROUP' }
): LayoutResult {
  const { groupId, direction, tabId } = op
  const layout = state.layoutRoot!
  const newLayout = splitGroup(layout, groupId, direction, tabId)

  const sourceGroup = findGroup(layout, groupId)
  const tabToFind = tabId || sourceGroup?.tabs[sourceGroup?.activeTabIndex ?? 0]?.id
  const newGroup = tabToFind ? findGroupContainingTab(newLayout, tabToFind) : null

  return {
    layoutRoot: newLayout,
    activeGroupId: newGroup?.id ?? groupId,
    activeTabId: tabToFind ?? state.activeTabId,
    openFilesToAdd: {},
    openFilesToRemove: [],
  }
}

// ---- SPLIT_WITH_TAB ----

function handleSplitWithTab(
  state: AppState,
  op: LayoutOperation & { type: 'SPLIT_WITH_TAB' }
): LayoutResult {
  const { tabId, fromGroupId, toGroupId, direction } = op
  const newLayout = splitWithTab(state.layoutRoot!, tabId, fromGroupId, toGroupId, direction)
  const newGroup = findGroupContainingTab(newLayout, tabId)

  return {
    layoutRoot: newLayout,
    activeGroupId: newGroup?.id ?? toGroupId,
    activeTabId: tabId,
    openFilesToAdd: {},
    openFilesToRemove: [],
  }
}

// ---- MOVE_TAB ----

function handleMoveTab(
  state: AppState,
  op: LayoutOperation & { type: 'MOVE_TAB' }
): LayoutResult {
  const { tabId, fromGroupId, toGroupId, toIndex } = op
  const newLayout = moveTab(state.layoutRoot!, tabId, fromGroupId, toGroupId, toIndex)

  return {
    layoutRoot: newLayout,
    activeGroupId: toGroupId,
    activeTabId: tabId,
    openFilesToAdd: {},
    openFilesToRemove: [],
  }
}

// ---- CLOSE_TAB ----

function handleCloseTab(
  state: AppState,
  op: LayoutOperation & { type: 'CLOSE_TAB' }
): LayoutResult {
  const { groupId, tabId } = op
  const layout = state.layoutRoot!
  const group = findGroup(layout, groupId)!

  const tabToClose = group.tabs.find((t) => t.id === tabId)
  const updatedGroup = removeTabFromGroup(group, tabId)

  let newLayout: LayoutNode
  let newActiveGroupId: string | null
  let newActiveTabId: string | null

  if (!updatedGroup) {
    newLayout = promoteSibling(layout, groupId)
    const first = getFirstGroup(newLayout)
    newActiveGroupId = first?.id ?? null
    newActiveTabId = first?.tabs[first?.activeTabIndex >= 0 ? first.activeTabIndex : 0]?.id ?? null
  } else {
    newLayout = transformNode(layout, groupId, () => updatedGroup)
    newActiveGroupId = groupId
    newActiveTabId = getActiveTab(updatedGroup)?.id ?? null
  }

  const removeIds: string[] = []
  if (tabToClose) {
    const allTabs = collectAllTabs(newLayout)
    if (!allTabs.some((t) => t.fileId === tabToClose.fileId && t.id !== tabId)) {
      removeIds.push(tabToClose.fileId)
    }
  }

  if (collectAllTabs(newLayout).length === 0) {
    return {
      layoutRoot: null, activeGroupId: null, activeTabId: null,
      openFilesToAdd: {},
      openFilesToRemove: [...new Set([...removeIds, ...Object.keys(state.openFiles)])],
    }
  }

  return {
    layoutRoot: newLayout, activeGroupId: newActiveGroupId, activeTabId: newActiveTabId,
    openFilesToAdd: {}, openFilesToRemove: removeIds,
  }
}

// ---- CLOSE_GROUP ----

function handleCloseGroup(
  state: AppState,
  op: LayoutOperation & { type: 'CLOSE_GROUP' }
): LayoutResult {
  const { groupId } = op
  const layout = state.layoutRoot!
  const closingGroup = findGroup(layout, groupId)
  const closingFileIds = closingGroup?.tabs.map((t) => t.fileId) ?? []

  const newLayout = promoteSibling(layout, groupId)
  const allTabs = collectAllTabs(newLayout)
  const remainingIds = new Set(allTabs.map((t) => t.fileId))
  const removeIds = closingFileIds.filter((id) => !remainingIds.has(id))

  if (allTabs.length === 0) {
    return {
      layoutRoot: null, activeGroupId: null, activeTabId: null,
      openFilesToAdd: {},
      openFilesToRemove: [...new Set([...removeIds, ...Object.keys(state.openFiles)])],
    }
  }

  const first = getFirstGroup(newLayout)
  return {
    layoutRoot: newLayout,
    activeGroupId: first?.id ?? null,
    activeTabId: first?.tabs[first?.activeTabIndex >= 0 ? first.activeTabIndex : 0]?.id ?? null,
    openFilesToAdd: {}, openFilesToRemove: removeIds,
  }
}
