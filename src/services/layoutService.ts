import type { LayoutState, LayoutNode, EditorGroup, OpenFile, TabEntry, SplitPosition } from '../types'
import { isSplitNode } from '../types'
import {
  findGroup,
  findGroupContainingTab,
  findGroupContainingFileId,
  getFirstGroup,
  getActiveTab,
  createDefaultLayout,
  createEditorGroup,
  addTabToGroup,
  removeTabFromGroup,
  transformNode,
  splitGroup,
  splitWithTab,
  splitWithFile,
  moveTab,
  promoteSibling,
  collectAllTabs,
  assertLayoutInvariants,
} from '../utils/layout'
import { createId } from '../utils/fileReader'
import { AI_WINDOW_ID } from '../utils/windowDescriptor'

// ---- Operation Types ----

export type LayoutOperation =
  | { type: 'OPEN_AI_WINDOW' }
  | { type: 'OPEN_FILE'; file: OpenFile; tabId: string; groupId?: string }
  | { type: 'OPEN_AND_SPLIT'; file: OpenFile; tabId: string; groupId: string; position: SplitPosition }
  | { type: 'SPLIT_GROUP'; groupId: string; position: SplitPosition; tabId?: string }
  | { type: 'SPLIT_WITH_TAB'; tabId: string; fromGroupId: string; toGroupId: string; position: SplitPosition }
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

function noChange(state: LayoutState): LayoutResult {
  return {
    layoutRoot: state.layoutRoot,
    activeGroupId: state.activeGroupId,
    activeTabId: state.activeTabId,
    openFilesToAdd: {},
    openFilesToRemove: [],
  }
}

function rebuild(state: LayoutState): LayoutResult {
  return {
    layoutRoot: null,
    activeGroupId: null,
    activeTabId: null,
    openFilesToRemove: Object.keys(state.openFiles),
    openFilesToAdd: {},
  }
}

// E10: shared "tree is empty → clear everything" result
function clearAllResult(state: LayoutState, extraRemoveIds: string[]): LayoutResult {
  return {
    layoutRoot: null,
    activeGroupId: null,
    activeTabId: null,
    openFilesToAdd: {},
    openFilesToRemove: [...new Set([...extraRemoveIds, ...Object.keys(state.openFiles)])],
  }
}

// ---- Validation ----

function validate(state: LayoutState, op: LayoutOperation): string | null {
  const root = state.layoutRoot

  // OPEN_FILE / OPEN_AI_WINDOW 允许空树（自行创建默认布局）
  if (op.type === 'OPEN_FILE' || op.type === 'OPEN_AI_WINDOW') {
    if (op.type === 'OPEN_FILE' && op.groupId && root && !findGroup(root, op.groupId)) {
      return `Group not found: ${op.groupId}`
    }
    return null
  }

  if (!root) return 'No layout root'

  switch (op.type) {
    case 'OPEN_AND_SPLIT':
      return findGroup(root, op.groupId) ? null : `Group not found: ${op.groupId}`
    case 'SPLIT_GROUP': {
      if (!findGroup(root, op.groupId)) return `Group not found: ${op.groupId}`
      // B19a: an explicit tabId must belong to the group being split
      if (op.tabId) {
        const group = findGroup(root, op.groupId)!
        if (!group.tabs.some((t) => t.id === op.tabId)) return `Tab ${op.tabId} not in group ${op.groupId}`
      }
      return null
    }
    case 'SPLIT_WITH_TAB':
      // B19b: the tab must live in fromGroupId, not just anywhere in the tree
      if (findGroupContainingTab(root, op.tabId)?.id !== op.fromGroupId) {
        return `Tab ${op.tabId} not in source group ${op.fromGroupId}`
      }
      if (!findGroup(root, op.toGroupId)) return `Target group not found: ${op.toGroupId}`
      return null
    case 'MOVE_TAB':
      // B19b: the tab must live in fromGroupId
      if (findGroupContainingTab(root, op.tabId)?.id !== op.fromGroupId) {
        return `Tab ${op.tabId} not in source group ${op.fromGroupId}`
      }
      if (!findGroup(root, op.toGroupId)) return `Target group not found: ${op.toGroupId}`
      return null
    case 'CLOSE_TAB': {
      const group = findGroup(root, op.groupId)
      if (!group) return `Group not found: ${op.groupId}`
      // B8: stale/duplicated close requests must not corrupt activeTabIndex
      if (!group.tabs.some((t) => t.id === op.tabId)) return `Tab ${op.tabId} not in group ${op.groupId}`
      return null
    }
    case 'CLOSE_GROUP':
      return findGroup(root, op.groupId) ? null : `Group not found: ${op.groupId}`
    default:
      return null
  }
}

// ---- Central Executor ----

export function execute(
  state: LayoutState,
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

  // R3/B19d: the second validation pass checks the full invariant set, not just
  // zero-child splits. On violation, keep the previous (known-good) state
  // instead of trusting the broken result.
  const problems = assertLayoutInvariants(result.layoutRoot, result.activeGroupId, result.activeTabId)
  if (problems.length > 0) {
    console.error('[layoutService] Invariants violated after operation:', problems, operation)
    return noChange(state)
  }

  return result
}

// ---- Apply ----

function apply(state: LayoutState, op: LayoutOperation): LayoutResult {
  switch (op.type) {
    case 'OPEN_AI_WINDOW':    return handleOpenAiWindow(state)
    case 'OPEN_FILE':         return handleOpenFile(state, op)
    case 'OPEN_AND_SPLIT':    return handleOpenAndSplit(state, op)
    case 'SPLIT_GROUP':       return handleSplitGroup(state, op)
    case 'SPLIT_WITH_TAB':    return handleSplitWithTab(state, op)
    case 'MOVE_TAB':          return handleMoveTab(state, op)
    case 'CLOSE_TAB':         return handleCloseTab(state, op)
    case 'CLOSE_GROUP':       return handleCloseGroup(state, op)
  }
}

// ---- OPEN_AI_WINDOW ----

// 在最外层布局的最右侧创建分屏；新 split 用新 id 使 Allotment 重挂载、sizes 生效
function splitRightOfRoot(root: LayoutNode, tab: TabEntry): LayoutNode {
  const newPane: EditorGroup = { ...createEditorGroup(), tabs: [tab], activeTabIndex: 0 }
  if (isSplitNode(root) && root.direction === 'horizontal') {
    return {
      ...root,
      id: createId('split'),
      children: [...root.children, newPane],
      sizes: [...root.sizes.map((s) => Math.round(s * 0.7)), 30],
    }
  }
  return {
    type: 'split',
    id: createId('split'),
    direction: 'horizontal',
    children: [root, newPane],
    sizes: [70, 30],
  }
}

function handleOpenAiWindow(state: LayoutState): LayoutResult {
  // 1. 已存在（按 AI_WINDOW_ID 全树查找）→ 激活
  const existingGroup = state.layoutRoot
    ? findGroupContainingFileId(state.layoutRoot, AI_WINDOW_ID)
    : null
  if (existingGroup) {
    const existingTab = existingGroup.tabs.find((t) => t.fileId === AI_WINDOW_ID)
    if (existingTab) {
      // B7: reuse must also move the group's activeTabIndex to the AI tab —
      // otherwise the tab bar highlights AI while the content shows another file,
      // and the document context silently disappears.
      const updatedGroup: EditorGroup = {
        ...existingGroup,
        activeTabIndex: existingGroup.tabs.findIndex((t) => t.id === existingTab.id),
      }
      return {
        layoutRoot: transformNode(state.layoutRoot!, existingGroup.id, () => updatedGroup),
        activeGroupId: existingGroup.id,
        activeTabId: existingTab.id,
        openFilesToAdd: {},
        openFilesToRemove: [],
      }
    }
  }

  const tab: TabEntry = {
    id: createId('tab-ai'),
    fileId: AI_WINDOW_ID,
    filePath: 'ai://chat',
    fileName: 'AI Chat',
    viewMode: 'preview',
  }

  // 2. 无布局 → 默认布局
  if (!state.layoutRoot) {
    const layout = createDefaultLayout()
    const group = getFirstGroup(layout)!
    const updated = addTabToGroup(group, tab)
    return {
      layoutRoot: transformNode(layout, group.id, () => updated),
      activeGroupId: group.id,
      activeTabId: tab.id,
      openFilesToAdd: {},
      openFilesToRemove: [],
    }
  }

  // 3. 最右侧分屏
  const newLayout = splitRightOfRoot(state.layoutRoot, tab)
  const newGroup = findGroupContainingTab(newLayout, tab.id)
  return {
    layoutRoot: newLayout,
    activeGroupId: newGroup?.id ?? null,
    activeTabId: tab.id,
    openFilesToAdd: {},
    openFilesToRemove: [],
  }
}

// ---- OPEN_FILE ----

function handleOpenFile(
  state: LayoutState,
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
  state: LayoutState,
  op: LayoutOperation & { type: 'OPEN_AND_SPLIT' }
): LayoutResult {
  const { file, tabId, groupId, position } = op
  const tab: TabEntry = {
    id: tabId, fileId: file.fileId, filePath: file.filePath,
    fileName: file.fileName, viewMode: 'preview',
  }
  const newLayout = splitWithFile(state.layoutRoot!, groupId, tab, position)
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
  state: LayoutState,
  op: LayoutOperation & { type: 'SPLIT_GROUP' }
): LayoutResult {
  const { groupId, position, tabId } = op
  const layout = state.layoutRoot!
  const newLayout = splitGroup(layout, groupId, position, tabId)

  // B19a: the active tab must be the tab that was actually moved
  // (splitGroup falls back to the group's active tab for an invalid tabId —
  // pointing at the requested tabId would leave activeTabId dangling).
  const sourceGroup = findGroup(layout, groupId)
  let movedTabId: string | null = null
  if (sourceGroup) {
    let moveIdx = -1
    if (tabId) moveIdx = sourceGroup.tabs.findIndex((t) => t.id === tabId)
    if (moveIdx < 0 && sourceGroup.activeTabIndex >= 0) moveIdx = sourceGroup.activeTabIndex
    movedTabId = sourceGroup.tabs[moveIdx]?.id ?? null
  }
  const newGroup = movedTabId ? findGroupContainingTab(newLayout, movedTabId) : null

  return {
    layoutRoot: newLayout,
    activeGroupId: newGroup?.id ?? groupId,
    activeTabId: movedTabId ?? state.activeTabId,
    openFilesToAdd: {},
    openFilesToRemove: [],
  }
}

// ---- SPLIT_WITH_TAB ----

function handleSplitWithTab(
  state: LayoutState,
  op: LayoutOperation & { type: 'SPLIT_WITH_TAB' }
): LayoutResult {
  const { tabId, fromGroupId, toGroupId, position } = op
  const newLayout = splitWithTab(state.layoutRoot!, tabId, fromGroupId, toGroupId, position)
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
  state: LayoutState,
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
  state: LayoutState,
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
    newActiveTabId = getActiveTab(first ?? ({} as EditorGroup))?.id ?? null
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
    return clearAllResult(state, removeIds)
  }

  return {
    layoutRoot: newLayout, activeGroupId: newActiveGroupId, activeTabId: newActiveTabId,
    openFilesToAdd: {}, openFilesToRemove: removeIds,
  }
}

// ---- CLOSE_GROUP ----

function handleCloseGroup(
  state: LayoutState,
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
    return clearAllResult(state, removeIds)
  }

  const first = getFirstGroup(newLayout)
  return {
    layoutRoot: newLayout,
    activeGroupId: first?.id ?? null,
    activeTabId: getActiveTab(first ?? ({} as EditorGroup))?.id ?? null,
    openFilesToAdd: {}, openFilesToRemove: removeIds,
  }
}
