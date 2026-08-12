import { describe, it, expect } from 'vitest'
import {
  createConversation, addUserNode, addAssistantNode, switchBranch,
  getPath, getAssistantReply, replaceAssistantReply, buildMessages,
  normalizeConversation, appendAssistantContent,
} from '../conversationTree'

function setup() {
  let conv = createConversation('test')
  conv = addUserNode(conv, 'First question')
  conv = addAssistantNode(conv, 'First answer')
  conv = addUserNode(conv, 'Second question')
  conv = addAssistantNode(conv, 'Second answer')
  return conv
}

describe('buildMessages', () => {
  it('B3: the current user message is sent exactly once', () => {
    const conv = setup()
    const userNodeId = conv.activeNodeId! // assistant; find parent user
    const userNode = conv.nodes[userNodeId].parentId
      ? conv.nodes[conv.nodes[userNodeId].parentId!]
      : null
    expect(userNode?.role).toBe('user')
    const messages = buildMessages(conv, userNode!.id, userNode!.content)
    const userTurns = messages.filter((m) => m.role === 'user')
    expect(userTurns).toHaveLength(2) // First question + Second question (once each)
    const second = userTurns.filter((m) => m.content === 'Second question')
    expect(second).toHaveLength(1)
  })

  it('B3: with selectedText the quoted message replaces (not duplicates) the bare one', () => {
    const conv = setup()
    const assistantId = conv.activeNodeId!
    const userNode = conv.nodes[conv.nodes[assistantId].parentId!]
    const messages = buildMessages(conv, userNode.id, userNode.content, 'selected words')
    const bare = messages.filter((m) => m.role === 'user' && m.content === 'Second question')
    expect(bare).toHaveLength(0)
    const quoted = messages.filter((m) => m.role === 'user' && m.content.includes('Selected text'))
    expect(quoted).toHaveLength(1)
  })

  it('B14: an oversized document is truncated to a bounded context', () => {
    const conv = setup()
    const assistantId = conv.activeNodeId!
    const userNode = conv.nodes[conv.nodes[assistantId].parentId!]
    const bigDoc = 'x'.repeat(100_000)
    const messages = buildMessages(conv, userNode.id, userNode.content, undefined, bigDoc)
    const system = messages[0]
    expect(system.role).toBe('system')
    expect(system.content.length).toBeLessThan(30_000)
    expect(system.content).toContain('truncated')
  })
})

describe('node creation guards', () => {
  it('B20c: addUserNode with a nonexistent parent returns the conversation unchanged', () => {
    const conv = setup()
    const result = addUserNode(conv, 'orphan', undefined, 'ghost-parent')
    expect(result).toBe(conv)
  })

  it('B20c: addAssistantNode with a nonexistent parent returns the conversation unchanged', () => {
    const conv = setup()
    const result = addAssistantNode(conv, 'orphan', 'ghost-parent')
    expect(result).toBe(conv)
  })

  it('B19g: addAssistantNode refuses a second reply under the same user node', () => {
    const conv = setup()
    const assistantId = conv.activeNodeId!
    const userNodeId = conv.nodes[assistantId].parentId!
    const result = addAssistantNode(conv, 'second reply', userNodeId)
    expect(result).toBe(conv)
    expect(getAssistantReply(result, userNodeId)!.content).toBe('Second answer')
  })
})

describe('getPath', () => {
  it('B20d: a corrupted parentId cycle terminates instead of looping forever', () => {
    const conv = setup()
    const assistantId = conv.activeNodeId!
    // create a cycle: parent chain loops back on itself
    const corrupt = {
      ...conv,
      nodes: {
        ...conv.nodes,
        [assistantId]: { ...conv.nodes[assistantId], parentId: 'ghost' },
        ghost: { ...conv.nodes[assistantId], id: 'ghost', parentId: assistantId },
      },
    }
    // must terminate
    const path = getPath(corrupt, assistantId)
    expect(path.length).toBeGreaterThan(0)
    expect(path.length).toBeLessThan(5)
  })
})

describe('replaceAssistantReply', () => {
  it('B20f: clears reasoning AND reasoningDuration together', () => {
    let conv = setup()
    const assistantId = conv.activeNodeId!
    const userNodeId = conv.nodes[assistantId].parentId!
    conv = {
      ...conv,
      nodes: {
        ...conv.nodes,
        [assistantId]: { ...conv.nodes[assistantId], reasoning: 'thinking...', reasoningDuration: 4000 },
      },
    }
    const result = replaceAssistantReply(conv, userNodeId, 'fresh')
    const reply = getAssistantReply(result, userNodeId)!
    expect(reply.content).toBe('fresh')
    expect(reply.reasoning).toBe('')
    expect(reply.reasoningDuration).toBeUndefined()
  })
})

describe('appendAssistantContent', () => {
  it('streams deltas onto the existing reply node', () => {
    const conv = setup()
    const assistantId = conv.activeNodeId!
    const userNodeId = conv.nodes[assistantId].parentId!
    let result = appendAssistantContent(conv, userNodeId, ' extra')
    result = appendAssistantContent(result, userNodeId, ' words')
    expect(getAssistantReply(result, userNodeId)!.content).toBe('Second answer extra words')
  })
})

describe('switchBranch', () => {
  it('ignores an unknown node id', () => {
    const conv = setup()
    expect(switchBranch(conv, 'ghost')).toBe(conv)
  })
})

describe('normalizeConversation', () => {
  it('R6: prunes unreachable orphan nodes and restores activeNodeId', () => {
    let conv = setup()
    const assistantId = conv.activeNodeId!
    const userNodeId = conv.nodes[assistantId].parentId!
    // orphan node not reachable from root
    const orphan = addAssistantNode({ ...conv, nodes: {} }, 'orphan') // fresh conv w/ no nodes
    conv = {
      ...conv,
      nodes: { ...conv.nodes, orphan: orphan.nodes[orphan.activeNodeId!] },
    }
    const normalized = normalizeConversation({ ...conv, activeNodeId: 'ghost-id' })
    expect(normalized.nodes.orphan).toBeUndefined()
    expect(normalized.activeNodeId).toBe(normalized.rootId)
    expect(normalized.rootId).toBeTruthy()
    void userNodeId
  })

  it('R6: prunes dangling childrenIds', () => {
    let conv = setup()
    const assistantId = conv.activeNodeId!
    conv = {
      ...conv,
      nodes: {
        ...conv.nodes,
        [assistantId]: { ...conv.nodes[assistantId], childrenIds: [...conv.nodes[assistantId].childrenIds, 'ghost-child'] },
      },
    }
    const normalized = normalizeConversation(conv)
    expect(normalized.nodes[assistantId].childrenIds).not.toContain('ghost-child')
  })
})
