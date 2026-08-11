// ---- Types ----

export interface ChatNode {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  selectedText?: string
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
  selectedText?: string,
  parentId?: string
): Conversation {
  const parent = parentId || conv.activeNodeId || conv.rootId
  const node: ChatNode = {
    id: nodeId(),
    role: 'user',
    content,
    selectedText,
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
  let current: string | null = nodeId
  while (current) {
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
export function getUserChildren(conv: Conversation, userNodeId: string): ChatNode[] {
  const node = conv.nodes[userNodeId]
  if (!node) return []
  return node.childrenIds
    .map((id) => conv.nodes[id])
    .filter((c): c is ChatNode => !!c && c.role === 'user')
}

// ---- Build Messages for API ----

export function buildMessages(
  conv: Conversation,
  nodeId: string,
  userInput: string,
  selectedText?: string
): Array<{ role: string; content: string }> {
  const path = getPath(conv, nodeId)
  const messages: Array<{ role: string; content: string }> = []

  // System message: brief context
  messages.push({
    role: 'system',
    content: 'You are a helpful assistant. The user is reading a Markdown document and has selected some text for context. Answer concisely.',
  })

  // History from the path (excluding root node if it's the first user message with selected text)
  for (const node of path) {
    if (node.role === 'system') continue
    messages.push({ role: node.role, content: node.content })
  }

  // Current user message with quoted selection
  let userContent = ''
  if (selectedText) {
    const quoted = selectedText.split('\n').map((line) => `> ${line}`).join('\n')
    userContent = `Selected text from document:\n${quoted}\n\n${userInput}`
  } else {
    userContent = userInput
  }
  messages.push({ role: 'user', content: userContent })

  return messages
}
