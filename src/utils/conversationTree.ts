// ---- Types ----

export interface ChatNode {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string // 深度思考内容（reasoning_content）
  reasoningDuration?: number // 深度思考耗时（ms）
  // 多条引用内容（用户划选后点击 📎 引用累计）
  selectedTexts?: string[]
  timestamp: number
  parentId: string | null
  childrenIds: string[]
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  nodes: Record<string, ChatNode>
  rootId: string | null
  activeNodeId: string | null
}

// ---- Node ID ----

function nodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function convId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// ---- Create ----

export function createConversation(title?: string): Conversation {
  return {
    id: convId(),
    title: title || 'New Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes: {},
    rootId: null,
    activeNodeId: null,
  }
}

// ---- Add Nodes ----

export function addUserNode(
  conv: Conversation,
  content: string,
  selectedTexts?: string[],
  parentId?: string
): Conversation {
  const parent = parentId || conv.activeNodeId || conv.rootId
  // B20c: an explicit parent that isn't in the tree would create an unreachable node
  if (parent && !conv.nodes[parent]) return conv
  const node: ChatNode = {
    id: nodeId(),
    role: 'user',
    content,
    selectedTexts,
    timestamp: Date.now(),
    parentId: parent || null,
    childrenIds: [],
  }

  const nodes = { ...conv.nodes, [node.id]: node }

  // Link from parent
  if (parent && nodes[parent]) {
    nodes[parent] = { ...nodes[parent], childrenIds: [...nodes[parent].childrenIds, node.id] }
  }

  const isFirst = !conv.rootId
  return {
    ...conv,
    nodes,
    rootId: isFirst ? node.id : conv.rootId,
    activeNodeId: node.id,
    title: isFirst ? (content.slice(0, 50) || 'New Chat') : conv.title,
    updatedAt: Date.now(),
  }
}

export function addAssistantNode(conv: Conversation, content: string, parentId?: string): Conversation {
  const parent = parentId || conv.activeNodeId
  if (!parent) return conv
  // B20c: explicit parent must exist in the tree
  if (!conv.nodes[parent]) return conv
  // B19g: one assistant reply per user node — a second one would become an
  // unreachable orphan (all append/replace helpers target the first child)
  if (getAssistantReply(conv, parent)) {
    console.warn('[conversationTree] addAssistantNode: parent already has a reply — ignoring')
    return conv
  }

  const node: ChatNode = {
    id: nodeId(),
    role: 'assistant',
    content,
    timestamp: Date.now(),
    parentId: parent,
    childrenIds: [],
  }

  const nodes = { ...conv.nodes, [node.id]: node }
  if (nodes[parent]) {
    nodes[parent] = { ...nodes[parent], childrenIds: [...nodes[parent].childrenIds, node.id] }
  }

  return {
    ...conv,
    nodes,
    activeNodeId: node.id,
    updatedAt: Date.now(),
  }
}

// ---- Navigate ----

export function switchBranch(conv: Conversation, nodeId: string): Conversation {
  if (!conv.nodes[nodeId]) return conv
  return { ...conv, activeNodeId: nodeId }
}

// ---- Path ----

export function getPath(conv: Conversation, nodeId: string | null): ChatNode[] {
  if (!nodeId || !conv.nodes[nodeId]) return []
  const path: ChatNode[] = []
  // B20d: a corrupted parentId chain (e.g. hand-edited save file) must not loop forever
  const visited = new Set<string>()
  let current: string | null = nodeId
  while (current && !visited.has(current)) {
    visited.add(current)
    const node: ChatNode | undefined = conv.nodes[current]
    if (!node) break
    path.unshift(node)
    current = node.parentId
  }
  return path
}

export function getActivePath(conv: Conversation): ChatNode[] {
  return getPath(conv, conv.activeNodeId)
}

// ---- Children / Siblings ----

export function getChildren(conv: Conversation, nodeId: string): ChatNode[] {
  const node = conv.nodes[nodeId]
  if (!node) return []
  return node.childrenIds.map((id) => conv.nodes[id]).filter(Boolean)
}

export function getSiblings(conv: Conversation, nodeId: string): ChatNode[] {
  const node = conv.nodes[nodeId]
  if (!node || !node.parentId) return []
  return getChildren(conv, node.parentId)
}

// ---- Content Operations ----

// 替换任意节点内容（用于编辑/重新生成）
export function replaceNodeContent(conv: Conversation, nodeId: string, newContent: string): Conversation {
  const node = conv.nodes[nodeId]
  if (!node) return conv
  const nodes = { ...conv.nodes, [nodeId]: { ...node, content: newContent } }
  return { ...conv, nodes, updatedAt: Date.now() }
}

// 替换 user 节点下的第一个 AI 回复内容（重新生成，清空 reasoning）
export function replaceAssistantReply(conv: Conversation, userNodeId: string, newContent: string): Conversation {
  const reply = getAssistantReply(conv, userNodeId)
  if (!reply) return conv
  // B20f: reasoning is cleared, so the duration of the old thinking must go too
  const nodes = { ...conv.nodes, [reply.id]: { ...reply, content: newContent, reasoning: '', reasoningDuration: undefined } }
  return { ...conv, nodes, activeNodeId: reply.id, updatedAt: Date.now() }
}

// E16: 增量追加到 AI 回复节点的某个字段（content / reasoning，流式显示）
export function appendAssistantField(
  conv: Conversation,
  userNodeId: string,
  field: 'content' | 'reasoning',
  delta: string
): Conversation {
  const reply = getAssistantReply(conv, userNodeId)
  if (!reply) return conv
  const base = field === 'reasoning' ? (reply.reasoning ?? '') : reply.content
  const nodes = { ...conv.nodes, [reply.id]: { ...reply, [field]: base + delta } }
  return { ...conv, nodes, updatedAt: Date.now() }
}

// 增量追加到 AI 回复节点（流式显示）
export function appendAssistantContent(conv: Conversation, userNodeId: string, delta: string): Conversation {
  return appendAssistantField(conv, userNodeId, 'content', delta)
}

// 增量追加深度思考内容（流式显示 reasoning_content）
export function appendAssistantReasoning(conv: Conversation, userNodeId: string, delta: string): Conversation {
  return appendAssistantField(conv, userNodeId, 'reasoning', delta)
}

// ---- Tree View Helpers ----

// 获取 user 节点的 AI 回复（第一个 assistant 子节点）
export function getAssistantReply(conv: Conversation, userNodeId: string): ChatNode | null {
  const node = conv.nodes[userNodeId]
  if (!node) return null
  for (const childId of node.childrenIds) {
    const child = conv.nodes[childId]
    if (child && child.role === 'assistant') return child
  }
  return null
}

// 获取 user 节点的 user 子节点（下一层分支起点）
// 展平：直接子 user 节点 + assistant 子节点下的 user 子节点
export function getUserChildren(conv: Conversation, userNodeId: string): ChatNode[] {
  const node = conv.nodes[userNodeId]
  if (!node) return []
  const result: ChatNode[] = []
  for (const childId of node.childrenIds) {
    const child = conv.nodes[childId]
    if (!child) continue
    if (child.role === 'user') {
      result.push(child)
    } else if (child.role === 'assistant') {
      // 新消息可能挂在 assistant 回复下（回溯到 AI 回复后发送）
      for (const gchildId of child.childrenIds) {
        const gchild = conv.nodes[gchildId]
        if (gchild && gchild.role === 'user') result.push(gchild)
      }
    }
  }
  return result
}

// ---- Build Messages for API ----

// B14: cap the injected document so a multi-MB file cannot blow the context
// window or the token bill. Keep head + tail so the structure stays visible.
const MAX_DOCUMENT_CONTEXT_CHARS = 24000

function truncateDocument(content: string): string {
  if (content.length <= MAX_DOCUMENT_CONTEXT_CHARS) return content
  const half = Math.floor(MAX_DOCUMENT_CONTEXT_CHARS / 2)
  return `${content.slice(0, half)}\n\n... (document truncated for context limits) ...\n\n${content.slice(-half)}`
}

export function buildMessages(
  conv: Conversation,
  nodeId: string,
  userInput: string,
  selectedTexts?: string[],
  documentContent?: string
): Array<{ role: string; content: string }> {
  const path = getPath(conv, nodeId)
  const messages: Array<{ role: string; content: string }> = []

  // System message: whole document wrapped in <document> + context
  const sysParts = [
    'You are a helpful assistant. The user is reading a Markdown document and has selected some text for context. Answer concisely.',
  ]
  if (documentContent) {
    sysParts.push(`\n\nThe document the user is reading:\n<document>\n${truncateDocument(documentContent)}\n</document>`)
  }
  messages.push({ role: 'system', content: sysParts.join('') })

  // B3: history excludes the last path node — getPath includes nodeId itself,
  // and the current user message is re-sent below with its quoted selection.
  // Sending it here too would duplicate the turn (double tokens, degraded output).
  for (const node of path.slice(0, -1)) {
    if (node.role === 'system') continue
    messages.push({ role: node.role, content: node.content })
  }

  // Current user message with quoted selections — each quote is its own block
  const quoteBlocks = (selectedTexts ?? []).map((text) => {
    const quoted = text.split('\n').map((line) => `> ${line}`).join('\n')
    return `Selected text from document:\n${quoted}`
  })
  const userContent = quoteBlocks.length > 0
    ? `${quoteBlocks.join('\n\n')}\n\n${userInput}`
    : userInput
  messages.push({ role: 'user', content: userContent })

  return messages
}

// ---- Validation / Repair (R6) ----

// Repair a conversation loaded from disk: drop unreachable orphan nodes, prune
// dangling childrenIds, and restore a valid rootId / activeNodeId.
export function normalizeConversation(conv: Conversation): Conversation {
  const reachable = new Set<string>()
  const stack: string[] = conv.rootId && conv.nodes[conv.rootId] ? [conv.rootId] : []
  while (stack.length) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const node = conv.nodes[id]
    if (!node) continue
    for (const childId of node.childrenIds) {
      if (conv.nodes[childId]) stack.push(childId)
    }
  }

  const nodes: Record<string, ChatNode> = {}
  for (const id of reachable) nodes[id] = conv.nodes[id]

  // Migrate legacy single-quote field (selectedText: string) to selectedTexts
  for (const id of reachable) {
    const legacy = conv.nodes[id] as ChatNode & { selectedText?: string }
    if (legacy.selectedText !== undefined && !legacy.selectedTexts) {
      const { selectedText: _legacy, ...rest } = legacy
      nodes[id] = { ...rest, selectedTexts: [legacy.selectedText] }
    }
  }

  // Prune childrenIds pointing at missing nodes
  for (const node of Object.values(nodes)) {
    const filtered = node.childrenIds.filter((cid) => nodes[cid])
    if (filtered.length !== node.childrenIds.length) {
      nodes[node.id] = { ...node, childrenIds: filtered }
    }
  }

  const rootId = conv.rootId && nodes[conv.rootId] ? conv.rootId : (Object.keys(nodes)[0] ?? null)
  const activeNodeId = conv.activeNodeId && nodes[conv.activeNodeId] ? conv.activeNodeId : rootId

  return { ...conv, nodes, rootId, activeNodeId }
}
