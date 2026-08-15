import { describe, it, expect } from 'vitest'
import {
  createEditorGroup, addTabToGroup, removeTabById, removeTabFromGroup,
  splitGroup, splitWithTab, moveTab, promoteSibling, makeSplitPair,
  transformNode, collectAllTabs, assertLayoutInvariants, findGroup, getActiveTab,
} from '../layout'
import { isSplitNode } from '../../types'
import type { EditorGroup, LayoutNode, TabEntry } from '../../types'

function tab(id: string, fileId: string): TabEntry {
  return { id, fileId, filePath: `/${fileId}.md`, fileName: fileId, viewMode: 'preview' }
}

function groupWith(...tabs: TabEntry[]): EditorGroup {
  const g = createEditorGroup()
  let current = g
  for (const t of tabs) current = addTabToGroup(current, t)
  return current
}

describe('removeTabById / removeTabFromGroup', () => {
  it('B8: removing a tab that is not in the group leaves the group untouched', () => {
    const g = groupWith(tab('a', 'file-a'), tab('b', 'file-b'))
    // activate b
    const g2 = { ...g, activeTabIndex: 1 }
    const result = removeTabById(g2, 'missing-tab')
    expect(result).toBeNull()
    const viaLegacy = removeTabFromGroup(g2, 'missing-tab')
    expect(viaLegacy).toEqual(g2)
  })

  it('removing the active tab activates the neighbour at the same index', () => {
    const g = groupWith(tab('a', 'file-a'), tab('b', 'file-b'), tab('c', 'file-c'))
    const g2 = { ...g, activeTabIndex: 1 }
    const result = removeTabById(g2, 'b')!
    expect(result.group.tabs.map((t) => t.id)).toEqual(['a', 'c'])
    expect(result.group.activeTabIndex).toBe(1)
  })

  it('removing a tab before the active one shifts the active index', () => {
    const g = groupWith(tab('a', 'file-a'), tab('b', 'file-b'), tab('c', 'file-c'))
    const g2 = { ...g, activeTabIndex: 2 }
    const result = removeTabById(g2, 'a')!
    expect(result.group.activeTabIndex).toBe(1)
  })

  it('removing the last tab yields an empty group with activeTabIndex -1', () => {
    const g = groupWith(tab('a', 'file-a'))
    const result = removeTabById(g, 'a')!
    expect(result.group.tabs).toEqual([])
    expect(result.group.activeTabIndex).toBe(-1)
  })
})

describe('addTabToGroup', () => {
  it('deduplicates by fileId and activates the existing tab', () => {
    const g = groupWith(tab('a', 'file-a'))
    const updated = addTabToGroup(g, tab('a2', 'file-a'))
    expect(updated.tabs).toHaveLength(1)
    expect(updated.tabs[0].id).toBe('a')
    expect(updated.activeTabIndex).toBe(0)
  })
})

describe('splitGroup', () => {
  it('moves the active tab into the new pane', () => {
    const root = groupWith(tab('a', 'file-a'), tab('b', 'file-b'))
    const result = splitGroup(root, root.id, 'right', 'b')
    expect(isSplitNode(result)).toBe(true)
    if (!isSplitNode(result)) return
    expect(result.direction).toBe('horizontal')
    expect(collectAllTabs(result).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('B20b: an out-of-range activeTabIndex splits with an empty pane instead of inserting undefined', () => {
    const root = { ...groupWith(tab('a', 'file-a')), activeTabIndex: 5 }
    const result = splitGroup(root, root.id, 'right')
    expect(isSplitNode(result)).toBe(true)
    const tabs = collectAllTabs(result)
    expect(tabs.every((t) => t !== undefined)).toBe(true)
    expect(tabs.map((t) => t.id)).toEqual(['a'])
  })

  it('splits with an empty pane when the group has no tabs', () => {
    const root = createEditorGroup()
    const result = splitGroup(root, root.id, 'bottom')
    expect(isSplitNode(result)).toBe(true)
    if (!isSplitNode(result)) return
    expect(result.direction).toBe('vertical')
    expect(result.children).toHaveLength(2)
    expect(collectAllTabs(result)).toHaveLength(0)
  })
})

describe('moveTab', () => {
  it('B9: moving into a group that already has the same file activates it instead of duplicating', () => {
    const gA = groupWith(tab('a1', 'file-a'))
    const gB = groupWith(tab('b1', 'file-b'), tab('a2', 'file-a'))
    const root: LayoutNode = {
      type: 'split', id: 'split-1', direction: 'horizontal',
      children: [gA, gB], sizes: [50, 50],
    }
    const result = moveTab(root, 'a1', gA.id, gB.id, 0)
    const target = findGroup(result, gB.id)!
    // file-a must appear once in the target group, activated
    expect(target.tabs.filter((t) => t.fileId === 'file-a')).toHaveLength(1)
    expect(target.activeTabIndex).toBe(target.tabs.findIndex((t) => t.fileId === 'file-a'))
    // the source group was emptied and removed
    expect(findGroup(result, gA.id)).toBeNull()
  })

  it('same-group reorder adjusts the target index after removal', () => {
    const g = groupWith(tab('a', 'file-a'), tab('b', 'file-b'), tab('c', 'file-c'))
    // toIndex is an insert-before index in the ORIGINAL array (pre-removal):
    // insert before 'c' (original index 2) → post-removal index 1
    const result = moveTab(g, 'a', g.id, g.id, 2)
    const target = findGroup(result, g.id)!
    expect(target.tabs.map((t) => t.id)).toEqual(['b', 'a', 'c'])
    // inserting at the end appends
    const resultEnd = moveTab(g, 'a', g.id, g.id, 3)
    expect(findGroup(resultEnd, g.id)!.tabs.map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('removing the last tab of the source group removes the group', () => {
    const gA = groupWith(tab('a1', 'file-a'))
    const gB = groupWith(tab('b1', 'file-b'))
    const root: LayoutNode = {
      type: 'split', id: 'split-1', direction: 'horizontal',
      children: [gA, gB], sizes: [50, 50],
    }
    const result = moveTab(root, 'a1', gA.id, gB.id, 1)
    expect(findGroup(result, gA.id)).toBeNull()
    expect(collectAllTabs(result).map((t) => t.id)).toEqual(['b1', 'a1'])
  })
})

describe('splitWithTab', () => {
  it('B9: deduplicates against the target group instead of creating a duplicate-file pane', () => {
    const gA = groupWith(tab('a1', 'file-a'))
    const gB = groupWith(tab('a2', 'file-a'))
    const root: LayoutNode = {
      type: 'split', id: 'split-1', direction: 'horizontal',
      children: [gA, gB], sizes: [50, 50],
    }
    const result = splitWithTab(root, 'a1', gA.id, gB.id, 'right')
    const target = findGroup(result, gB.id)!
    expect(target.tabs.filter((t) => t.fileId === 'file-a')).toHaveLength(1)
  })
})

describe('removeNode (via promoteSibling / closeGroup)', () => {
  it('B10: closing both groups of a nested split leaves no zero-size ghost pane', () => {
    // outer: [ gLeft, inner: [ gA, gB ] ]
    const gA = groupWith(tab('a', 'file-a'))
    const gB = groupWith(tab('b', 'file-b'))
    const inner: LayoutNode = { type: 'split', id: 'inner', direction: 'vertical', children: [gA, gB], sizes: [50, 50] }
    const gLeft = groupWith(tab('l', 'file-l'))
    const root: LayoutNode = { type: 'split', id: 'outer', direction: 'horizontal', children: [gLeft, inner], sizes: [50, 50] }

    // close gA: inner keeps gB with normalized sizes
    const afterA = promoteSibling(root, gA.id)
    expect(findGroup(afterA, gA.id)).toBeNull()
    expect(findGroup(afterA, gB.id)).not.toBeNull()

    // close gB: the inner split collapses entirely and gLeft is lifted to the
    // root — no replacement ghost group, no zero-size pane (B10)
    const afterB = promoteSibling(afterA, gB.id)
    const problems = assertLayoutInvariants(afterB, gLeft.id, 'l')
    expect(problems).toEqual([])
    const tabs = collectAllTabs(afterB)
    expect(tabs.map((t) => t.id)).toEqual(['l'])
    // the root is now the surviving group itself (split lifted away)
    expect(afterB.type).toBe('group')
  })
})

describe('B20e: sizes normalization', () => {
  it('remaining sizes are re-normalized to sum 100 after a pane closes', () => {
    const gA = groupWith(tab('a', 'file-a'))
    const gB = groupWith(tab('b', 'file-b'))
    const gC = groupWith(tab('c', 'file-c'))
    const root: LayoutNode = {
      type: 'split', id: 'split-1', direction: 'horizontal',
      children: [gA, gB, gC], sizes: [50, 30, 20],
    }
    const result = promoteSibling(root, gB.id)
    expect(isSplitNode(result)).toBe(true)
    if (!isSplitNode(result)) return
    expect(result.children).toHaveLength(2)
    expect(result.sizes.reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('assertLayoutInvariants', () => {
  it('reports dangling active ids and duplicate fileIds', () => {
    // build manually — addTabToGroup deduplicates, so duplicates can't be
    // created through the normal path (they come from corrupted state)
    const g: EditorGroup = {
      type: 'group', id: 'g-1',
      tabs: [tab('a', 'file-a'), tab('b', 'file-a')],
      activeTabIndex: 0,
    }
    const problems = assertLayoutInvariants(g, 'ghost-group', 'ghost-tab')
    expect(problems.some((p) => p.includes('duplicate fileId'))).toBe(true)
    expect(problems.some((p) => p.includes('activeGroupId'))).toBe(true)
    expect(problems.some((p) => p.includes('activeTabId'))).toBe(true)
  })

  it('passes a healthy tree', () => {
    const g = groupWith(tab('a', 'file-a'))
    expect(assertLayoutInvariants(g, g.id, 'a')).toEqual([])
  })
})

describe('makeSplitPair', () => {
  it('bottom puts the original group first, new pane second', () => {
    const g = groupWith(tab('a', 'file-a'))
    const result = makeSplitPair(g, tab('ai', 'ai-file'), 'bottom')
    expect(result.direction).toBe('vertical')
    expect(result.children[0].id).toBe(g.id)
    expect(result.children[1].id).not.toBe(g.id)
    expect(collectAllTabs(result.children[1]).map((t) => t.id)).toEqual(['ai'])
  })

  it('right puts the new pane on the right (second child)', () => {
    const g = groupWith(tab('a', 'file-a'))
    const result = makeSplitPair(g, tab('ai', 'ai-file'), 'right')
    expect(result.direction).toBe('horizontal')
    expect(result.children[0].id).toBe(g.id)
    expect(collectAllTabs(result.children[1]).map((t) => t.id)).toEqual(['ai'])
  })

  it('honors custom sizes and defaults to [50, 50]', () => {
    const g = groupWith(tab('a', 'file-a'))
    expect(makeSplitPair(g, tab('b', 'file-b'), 'right').sizes).toEqual([50, 50])
    expect(makeSplitPair(g, tab('b', 'file-b'), 'bottom', [70, 30]).sizes).toEqual([70, 30])
  })

  it('does not dedup by fileId (AI tabs share AI_WINDOW_ID)', () => {
    const g = groupWith(tab('ai-1', 'ai-window'))
    const result = makeSplitPair(g, tab('ai-2', 'ai-window'), 'bottom')
    const tabs = collectAllTabs(result)
    expect(tabs.map((t) => t.id).sort()).toEqual(['ai-1', 'ai-2'])
  })
})

describe('transformNode / getActiveTab', () => {
  it('transformNode keeps untouched subtrees by reference', () => {
    const gA = groupWith(tab('a', 'file-a'))
    const gB = groupWith(tab('b', 'file-b'))
    const root: LayoutNode = { type: 'split', id: 's', direction: 'vertical', children: [gA, gB], sizes: [50, 50] }
    const result = transformNode(root, gA.id, (group) => ({ ...group, tabs: [...group.tabs], activeTabIndex: 0 }))
    expect(isSplitNode(result)).toBe(true)
    if (!isSplitNode(result)) return
    expect(result.children[1]).toBe(gB)
  })

  it('getActiveTab returns null for an empty group', () => {
    expect(getActiveTab(createEditorGroup())).toBeNull()
  })
})
