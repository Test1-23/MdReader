import { describe, it, expect, beforeEach, vi } from 'vitest'
import { execute } from '../layoutService'
import type { LayoutResult } from '../layoutService'
import type { LayoutState, LayoutNode, EditorGroup, OpenFile } from '../../types'
import {
  collectAllTabs, findGroup, findGroupContainingFileId, findGroupContainingTab, getActiveTab,
} from '../../utils/layout'
import { AI_WINDOW_ID } from '../../utils/windowDescriptor'
import { createId } from '../../utils/fileReader'

function openFile(fileId: string): OpenFile {
  return {
    fileId, filePath: `/${fileId}.md`, fileName: `${fileId}.md`,
    content: '# Hi', fileSize: 4, lastModified: 1, headings: [],
  }
}

function emptyState(): LayoutState {
  return {
    fileTreeRoot: null, fileTree: null, sidebarLoading: false,
    layoutRoot: null, activeGroupId: null, activeTabId: null,
    lastAiTabId: null, lastFileGroupId: null, openFiles: {},
  }
}

function toState(prev: LayoutState, result: LayoutResult): LayoutState {
  let openFiles = { ...prev.openFiles }
  for (const [id, file] of Object.entries(result.openFilesToAdd)) openFiles[id] = file
  if (result.openFilesToRemove.length > 0) {
    for (const id of result.openFilesToRemove) {
      const { [id]: _, ...rest } = openFiles as Record<string, unknown>
      openFiles = rest as unknown as typeof openFiles
    }
  }
  // mirror applyLayoutResult's lastAiTabId / lastFileGroupId maintenance
  let lastAiTabId = prev.lastAiTabId
  let lastFileGroupId = prev.lastFileGroupId
  if (result.layoutRoot && result.activeTabId) {
    const activeGroup = findGroupContainingTab(result.layoutRoot, result.activeTabId)
    const activeTab = activeGroup?.tabs.find((t) => t.id === result.activeTabId)
    if (activeTab?.fileId === AI_WINDOW_ID) lastAiTabId = activeTab.id
    else if (result.activeGroupId) lastFileGroupId = result.activeGroupId
  }
  return {
    fileTreeRoot: prev.fileTreeRoot, fileTree: prev.fileTree, sidebarLoading: prev.sidebarLoading,
    layoutRoot: result.layoutRoot,
    activeGroupId: result.activeGroupId,
    activeTabId: result.activeTabId,
    lastAiTabId,
    lastFileGroupId,
    openFiles,
  }
}

function openFileOp(state: LayoutState, fileId: string): LayoutState {
  return toState(state, execute(state, { type: 'OPEN_FILE', file: openFile(fileId), tabId: createId('tab') }))
}

function collectGroups(root: LayoutNode): EditorGroup[] {
  const result: EditorGroup[] = []
  const walk = (node: LayoutNode) => {
    if (node.type === 'group') result.push(node)
    else node.children.forEach(walk)
  }
  walk(root)
  return result
}

function setGroupActive(root: LayoutNode, groupId: string, index: number): LayoutNode {
  if (root.type === 'group') {
    return root.id === groupId ? { ...root, activeTabIndex: index } : root
  }
  return { ...root, children: root.children.map((c) => setGroupActive(c, groupId, index)) }
}

function parentOf(root: LayoutNode, targetId: string): LayoutNode | null {
  if (root.type === 'group') return null
  for (const child of root.children) {
    if (child.id === targetId) return root
    const found = parentOf(child, targetId)
    if (found) return found
  }
  return null
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('OPEN_AI_WINDOW', () => {
  it('B7: reusing the AI window moves the group activeTabIndex to the AI tab', () => {
    let state = openFileOp(emptyState(), 'doc')
    const docTabId = state.activeTabId!

    // Open the AI window
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    const aiGroup = findGroupContainingFileId(state.layoutRoot!, AI_WINDOW_ID)!
    const aiTab = aiGroup.tabs.find((t) => t.fileId === AI_WINDOW_ID)!

    // Move the doc tab into the AI group (MOVE_TAB) so the group has two tabs,
    // then switch its activeTabIndex back to the doc tab
    const docGroup = findGroupContainingTab(state.layoutRoot!, docTabId)!
    state = toState(state, execute(state, {
      type: 'MOVE_TAB', tabId: docTabId, fromGroupId: docGroup.id, toGroupId: aiGroup.id, toIndex: 0,
    }))
    const mergedGroup = findGroupContainingFileId(state.layoutRoot!, AI_WINDOW_ID)!
    const docIdx = mergedGroup.tabs.findIndex((t) => t.id === docTabId)
    state = {
      ...state,
      layoutRoot: setGroupActive(state.layoutRoot!, mergedGroup.id, docIdx),
      activeGroupId: mergedGroup.id,
      activeTabId: docTabId,
    }

    // Reopen the AI window — the group's activeTabIndex must point at the AI tab
    const reopened = execute(state, { type: 'OPEN_AI_WINDOW' })
    const groupAfter = findGroupContainingFileId(reopened.layoutRoot!, AI_WINDOW_ID)!
    const activeTab = getActiveTab(groupAfter)!
    expect(activeTab.fileId).toBe(AI_WINDOW_ID)
    expect(activeTab.id).toBe(aiTab.id)
    expect(groupAfter.activeTabIndex).toBe(groupAfter.tabs.findIndex((t) => t.fileId === AI_WINDOW_ID))
  })
})

describe('OPEN_AI_WINDOW_BELOW_FOCUS', () => {
  it('splits below the focused group and activates the new AI tab', () => {
    let state = openFileOp(emptyState(), 'a')
    const focusGroupId = state.activeGroupId!
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    expect(state.layoutRoot).not.toBeNull()
    expect(state.activeTabId).not.toBeNull()
    const aiGroup = findGroupContainingTab(state.layoutRoot!, state.activeTabId!)!
    // the new pane is a vertical split below the focused group, second child
    expect(state.layoutRoot!.type).toBe('split')
    if (state.layoutRoot!.type === 'split') {
      expect(state.layoutRoot!.direction).toBe('vertical')
      expect(state.layoutRoot!.children[0].id).toBe(focusGroupId)
      expect(state.layoutRoot!.children[1].id).toBe(aiGroup.id)
      expect(state.layoutRoot!.sizes).toEqual([70, 30])
    }
    // the focused group keeps its tabs
    const focusGroup = findGroup(state.layoutRoot!, focusGroupId)!
    expect(collectAllTabs(focusGroup).length).toBe(1)
    expect(getActiveTab(aiGroup)!.fileId).toBe(AI_WINDOW_ID)
    expect(state.lastAiTabId).toBe(state.activeTabId)
  })

  it('creates a default layout with the AI tab when the tree is empty', () => {
    const result = execute(emptyState(), { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' })
    expect(result.layoutRoot).not.toBeNull()
    expect(result.activeTabId).not.toBeNull()
    expect(collectAllTabs(result.layoutRoot!).some((t) => t.fileId === AI_WINDOW_ID)).toBe(true)
  })

  it('falls back to the first group when activeGroupId is stale', () => {
    const state = openFileOp(emptyState(), 'a')
    const stale = { ...state, activeGroupId: 'ghost-group' }
    const result = execute(stale, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' })
    expect(result.layoutRoot).not.toBeNull()
    expect(result.activeTabId).not.toBeNull()
  })

  it('always creates a second window even when an AI window already exists', () => {
    let state = openFileOp(emptyState(), 'a')
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    const aiTabIdsBefore = collectAllTabs(state.layoutRoot!).filter((t) => t.fileId === AI_WINDOW_ID).map((t) => t.id)
    expect(aiTabIdsBefore).toHaveLength(1)
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    const aiTabIdsAfter = collectAllTabs(state.layoutRoot!).filter((t) => t.fileId === AI_WINDOW_ID).map((t) => t.id)
    expect(aiTabIdsAfter).toHaveLength(2)
  })

  it('regression: after the quote flow stole focus to the AI window, 💬 anchors under the DOCUMENT group', () => {
    // 复现根因：OPEN_AI_WINDOW（引用流）把 activeGroupId 抢到 AI 窗口
    let state = openFileOp(emptyState(), 'a')
    const docGroupId = state.activeGroupId!
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    // 此时活跃组是 AI 窗口（引用流语义正确），lastFileGroupId 记住文档组
    expect(state.activeGroupId).not.toBe(docGroupId)
    expect(state.lastFileGroupId).toBe(docGroupId)

    // 点 💬：新窗必须分屏在文档组下方，而不是 AI 窗口下方
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    const newGroupId = findGroupContainingTab(state.layoutRoot!, state.activeTabId!)!.id
    const docGroup = findGroup(state.layoutRoot!, docGroupId)!
    const newGroup = findGroup(state.layoutRoot!, newGroupId)!
    // 新窗组与文档组共享同一个父 split（即分屏在文档组下方）
    const docParent = parentOf(state.layoutRoot!, docGroup.id)
    const newParent = parentOf(state.layoutRoot!, newGroup.id)
    expect(docParent).not.toBeNull()
    expect(newParent?.id).toBe(docParent?.id)
    // 父 split 是纵向（bottom），原组（文档组）在前
    expect(docParent!.type).toBe('split')
    if (docParent!.type === 'split') {
      expect(docParent!.direction).toBe('vertical')
      expect(docParent!.children[0].id).toBe(docGroup.id)
      expect(docParent!.children[1].id).toBe(newGroup.id)
    }
  })

  it('successive 💬 clicks keep anchoring the same document group (never stack under an AI window)', () => {
    let state = openFileOp(emptyState(), 'a')
    const docGroupId = state.activeGroupId!
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    const firstNewAiGroupId = findGroupContainingTab(state.layoutRoot!, state.activeTabId!)!.id
    // 第一次 💬 后活跃组是新 AI 窗；再点 💬 仍应锚定文档组
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    const secondNewAiGroupId = findGroupContainingTab(state.layoutRoot!, state.activeTabId!)!.id
    expect(secondNewAiGroupId).not.toBe(firstNewAiGroupId)
    // 第二个新窗与文档组共享父 split（仍分屏在文档组下方，而非第一个 AI 窗下）
    const docGroup = findGroup(state.layoutRoot!, docGroupId)!
    const secondNewGroup = findGroup(state.layoutRoot!, secondNewAiGroupId)!
    const docParent = parentOf(state.layoutRoot!, docGroup.id)
    const secondParent = parentOf(state.layoutRoot!, secondNewGroup.id)
    expect(docParent).not.toBeNull()
    expect(secondParent?.id).toBe(docParent?.id)
  })

  it('falls back to the first group when the active group is an AI window and lastFileGroupId is stale', () => {
    let state = openFileOp(emptyState(), 'a')
    const firstGroupId = state.activeGroupId!
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    // 人为清空锚点并指向 AI 组
    const stale = { ...state, lastFileGroupId: null }
    const result = execute(stale, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' })
    expect(result.layoutRoot).not.toBeNull()
    expect(result.activeTabId).not.toBeNull()
    // 新窗分屏在第一个组（文档组）下方
    const firstGroup = findGroup(result.layoutRoot!, firstGroupId)!
    const newGroup = findGroupContainingTab(result.layoutRoot!, result.activeTabId!)!
    const firstParent = parentOf(result.layoutRoot!, firstGroup.id)
    const newParent = parentOf(result.layoutRoot!, newGroup.id)
    expect(firstParent).not.toBeNull()
    expect(newParent?.id).toBe(firstParent?.id)
  })
})

describe('OPEN_AI_WINDOW focus preference', () => {
  it('focuses the most recently focused AI window when several exist', () => {
    let state = openFileOp(emptyState(), 'a')
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    const firstAiTabId = state.activeTabId!
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    const secondAiTabId = state.activeTabId!
    expect(firstAiTabId).not.toBe(secondAiTabId)
    expect(state.lastAiTabId).toBe(secondAiTabId)

    // switch focus back to the FIRST AI window, then quote-flow must re-focus it
    const firstGroup = findGroupContainingTab(state.layoutRoot!, firstAiTabId)!
    state = {
      ...state,
      layoutRoot: setGroupActive(state.layoutRoot!, firstGroup.id, firstGroup.tabs.findIndex((t) => t.id === firstAiTabId)),
      activeGroupId: firstGroup.id,
      activeTabId: firstAiTabId,
      lastAiTabId: firstAiTabId,
    }
    const reopened = execute(state, { type: 'OPEN_AI_WINDOW' })
    expect(reopened.activeTabId).toBe(firstAiTabId)
    expect(reopened.layoutRoot).not.toBe(state.layoutRoot) // activeTabIndex updated
  })

  it('falls back to the remaining AI window when lastAiTabId is stale', () => {
    let state = openFileOp(emptyState(), 'a')
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    const onlyAiTabId = state.activeTabId!
    const stale = { ...state, lastAiTabId: 'closed-tab' }
    const result = execute(stale, { type: 'OPEN_AI_WINDOW' })
    expect(result.activeTabId).toBe(onlyAiTabId)
  })
})

describe('MOVE_TAB with two AI windows', () => {
  it('moving an AI tab into a group that already has one is a silent no-op', () => {
    let state = openFileOp(emptyState(), 'a')
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    const aiTabId = state.activeTabId!
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    // both AI windows are in different groups now; move the first into the second's group
    const targetGroup = findGroupContainingTab(state.layoutRoot!, state.activeTabId!)!
    const result = execute(state, { type: 'MOVE_TAB', tabId: aiTabId, fromGroupId: findGroupContainingTab(state.layoutRoot!, aiTabId)!.id, toGroupId: targetGroup.id, toIndex: 0 })
    // B9 dedup + invariant rejection → state unchanged (accepted semantics)
    expect(result.layoutRoot).toBe(state.layoutRoot)
  })
})

describe('SPLIT_GROUP', () => {
  it('B19a: a stale tabId is rejected by validation instead of leaving a dangling activeTabId', () => {
    const state = openFileOp(emptyState(), 'doc')
    const result = execute(state, { type: 'SPLIT_GROUP', groupId: state.activeGroupId!, position: 'right', tabId: 'nonexistent' })
    expect(result.layoutRoot).toBe(state.layoutRoot)
    expect(result.activeTabId).toBe(state.activeTabId)
  })
})

describe('MOVE_TAB', () => {
  it('B19b: claiming the wrong source group is rejected (no silent no-op state drift)', () => {
    let state = openFileOp(emptyState(), 'a')
    state = openFileOp(state, 'b')
    const g1 = state.activeGroupId!
    state = toState(state, execute(state, { type: 'SPLIT_GROUP', groupId: g1, position: 'right' }))
    // after split, activeTabId lives in the new group — g1 is the wrong fromGroupId
    const tabId = state.activeTabId!
    const realGroup = findGroupContainingTab(state.layoutRoot!, tabId)!
    const wrongGroupId = realGroup.id === g1 ? collectGroups(state.layoutRoot!).find((g) => g.id !== g1)!.id : g1

    const result = execute(state, { type: 'MOVE_TAB', tabId, fromGroupId: wrongGroupId, toGroupId: realGroup.id, toIndex: 0 })
    expect(result.layoutRoot).toBe(state.layoutRoot)
  })
})

describe('CLOSE_TAB', () => {
  it('B8: closing a stale tabId is rejected without corrupting activeTabIndex', () => {
    const state = openFileOp(emptyState(), 'a')
    const result = execute(state, { type: 'CLOSE_TAB', groupId: state.activeGroupId!, tabId: 'stale-tab' })
    expect(result.layoutRoot).toBe(state.layoutRoot)
    const group = findGroup(result.layoutRoot!, state.activeGroupId!)!
    expect(group.activeTabIndex).toBe(0)
  })

  it('closing the last tab clears the layout and all open files', () => {
    const state = openFileOp(emptyState(), 'a')
    const result = execute(state, { type: 'CLOSE_TAB', groupId: state.activeGroupId!, tabId: state.activeTabId! })
    expect(result.layoutRoot).toBeNull()
    expect(result.openFilesToRemove).toContain('a')
  })
})

describe('CLOSE_GROUP', () => {
  it('closing a nested group promotes the sibling and keeps active ids valid', () => {
    let state = openFileOp(emptyState(), 'a')
    const g1 = state.activeGroupId!
    state = openFileOp(state, 'b')
    state = toState(state, execute(state, { type: 'SPLIT_GROUP', groupId: g1, position: 'bottom' }))
    const groups = collectGroups(state.layoutRoot!)
    state = toState(state, execute(state, { type: 'SPLIT_GROUP', groupId: groups[1].id, position: 'right' }))
    const nested = collectGroups(state.layoutRoot!)
    const result = execute(state, { type: 'CLOSE_GROUP', groupId: nested[2].id })
    expect(result.layoutRoot).not.toBeNull()
    expect(result.activeGroupId).not.toBeNull()
    expect(result.activeTabId).not.toBeNull()
    expect(collectAllTabs(result.layoutRoot!).length).toBeGreaterThan(0)
  })
})

describe('invariants', () => {
  it('a sequence of operations always ends in a consistent state', () => {
    let state = emptyState()
    state = openFileOp(state, 'a')
    state = openFileOp(state, 'b')
    state = toState(state, execute(state, { type: 'SPLIT_GROUP', groupId: state.activeGroupId!, position: 'right' }))
    state = toState(state, execute(state, { type: 'SPLIT_GROUP', groupId: state.activeGroupId!, position: 'bottom' }))
    state = toState(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    state = toState(state, execute(state, { type: 'CLOSE_GROUP', groupId: state.activeGroupId! }))
    // closing the last tab of the lifted group leaves an empty pane as the
    // active group — its activeTabId is null and the group is closable
    state = toState(state, execute(state, { type: 'CLOSE_TAB', groupId: state.activeGroupId!, tabId: state.activeTabId! }))
    if (state.layoutRoot) {
      state = toState(state, execute(state, { type: 'CLOSE_GROUP', groupId: state.activeGroupId! }))
    }
    // close the remaining tab(s) — the tree empties and openFiles clears
    while (state.layoutRoot) {
      const tabs = collectAllTabs(state.layoutRoot)
      if (tabs.length === 0) {
        // only empty groups remain — close them
        const groups = collectGroups(state.layoutRoot)
        state = toState(state, execute(state, { type: 'CLOSE_GROUP', groupId: groups[0].id }))
      } else {
        const group = collectGroups(state.layoutRoot).find((g) => g.tabs.length > 0)!
        const tab = group.tabs[group.activeTabIndex >= 0 ? group.activeTabIndex : 0]
        state = toState(state, execute(state, { type: 'CLOSE_TAB', groupId: group.id, tabId: tab.id }))
      }
    }
    expect(state.layoutRoot).toBeNull()
    expect(state.openFiles).toEqual({})
  })
})
