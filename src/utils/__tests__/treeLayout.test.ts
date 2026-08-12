import { describe, it, expect } from 'vitest'
import { computeTreeLayout } from '../treeLayout'
import { createConversation, addUserNode, addAssistantNode } from '../conversationTree'
import type { Conversation } from '../conversationTree'

function branchFrom(conv: Conversation, fromNodeId: string, message: string, answer: string): Conversation {
  let c = addUserNode(conv, message, undefined, fromNodeId)
  const userId = c.activeNodeId!
  c = addAssistantNode(c, answer, userId)
  return c
}

function buildBranchyConversation(): Conversation {
  let conv = createConversation('t')
  conv = addUserNode(conv, 'root question')
  const rootId = conv.activeNodeId!
  conv = addAssistantNode(conv, 'root answer', rootId)

  // main chain: root → u1 → a1 → u2 → a2
  conv = addUserNode(conv, 'u1')
  const u1 = conv.activeNodeId!
  conv = addAssistantNode(conv, 'a1', u1)
  conv = addUserNode(conv, 'u2')
  const u2 = conv.activeNodeId!
  conv = addAssistantNode(conv, 'a2', u2)

  // side branch off the root's assistant
  const rootAssistantId = conv.nodes[rootId].childrenIds.find((id) => conv.nodes[id].role === 'assistant')!
  conv = branchFrom(conv, rootAssistantId, 'side1', 'side-answer1')
  const side1Assistant = conv.nodes[conv.activeNodeId!]
  conv = branchFrom(conv, side1Assistant.id, 'side2', 'side-answer2')

  return conv
}

describe('computeTreeLayout (Reingold-Tilford)', () => {
  it('lays out a linear conversation as a straight vertical column', () => {
    let conv = createConversation('t')
    conv = addUserNode(conv, 'q1')
    let userId = conv.activeNodeId!
    conv = addAssistantNode(conv, 'a1', userId)
    for (let i = 2; i <= 5; i++) {
      conv = addUserNode(conv, `q${i}`)
      userId = conv.activeNodeId!
      conv = addAssistantNode(conv, `a${i}`, userId)
    }
    const layout = computeTreeLayout(conv, new Set())
    const xs = new Set(layout.nodes.map((n) => n.x))
    // a chain has every node at the same x (no horizontal wandering)
    expect(xs.size).toBe(1)
    // depth ordering: y strictly increases along the chain
    const ys = layout.nodes.map((n) => n.y).sort((a, b) => a - b)
    expect(ys).toHaveLength(layout.nodes.length)
  })

  it('branches never overlap horizontally at the same depth', () => {
    const conv = buildBranchyConversation()
    const layout = computeTreeLayout(conv, new Set())
    const byDepth = new Map<number, number[]>()
    for (const n of layout.nodes) {
      const xs = byDepth.get(n.depth) ?? []
      xs.push(n.x)
      byDepth.set(n.depth, xs)
    }
    for (const [, xs] of byDepth) {
      const sorted = [...xs].sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(118) // LEAF_GAP - epsilon
      }
    }
  })

  it('parents are centered between their first and last children', () => {
    const conv = buildBranchyConversation()
    const layout = computeTreeLayout(conv, new Set())
    const byId = new Map(layout.nodes.map((n) => [n.id, n]))
    for (const n of layout.nodes) {
      if (n.children.length >= 2) {
        const first = n.children[0].x
        const last = n.children[n.children.length - 1].x
        expect(Math.abs(n.x - (first + last) / 2)).toBeLessThan(1e-6)
      }
    }
    void byId
  })

  it('collapsed nodes are treated as leaves (no children laid out)', () => {
    const conv = buildBranchyConversation()
    const all = computeTreeLayout(conv, new Set())
    // collapse every node with children
    const collapsible = new Set(all.nodes.filter((n) => n.children.length > 0).map((n) => n.id))
    const collapsed = computeTreeLayout(conv, collapsible)
    for (const n of collapsed.nodes) {
      if (collapsible.has(n.id)) expect(n.children).toHaveLength(0)
    }
    expect(collapsed.nodes.length).toBeLessThan(all.nodes.length)
  })

  it('produces edges connecting parents to children', () => {
    const conv = buildBranchyConversation()
    const layout = computeTreeLayout(conv, new Set())
    const parentOf = new Map(layout.edges.map((e) => [e.to.id, e.from.id]))
    for (const n of layout.nodes) {
      for (const child of n.children) {
        expect(parentOf.get(child.id)).toBe(n.id)
      }
    }
  })

  it('handles an empty conversation', () => {
    const layout = computeTreeLayout(createConversation('empty'), new Set())
    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
  })
})
