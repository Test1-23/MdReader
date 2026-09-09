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

/** 节点是否成功挂入 —— 调用方据此判断消息是否被静默丢弃 */
export function canAppendTo(conv: Conversation, parentId?: string): boolean {
  const parent = parentId || conv.activeNodeId || conv.rootId
  return !parent || !!conv.nodes[parent]
}

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

// ---- Validation / Repair (R6) ----

/** 磁盘数据不可信 —— 宽松校验节点形状，坏数据被修复/丢弃而不是抛异常 */
function sanitizeNode(value: unknown): ChatNode | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || raw.id.length === 0) return null
  if (raw.role !== 'user' && raw.role !== 'assistant' && raw.role !== 'system') return null
  if (typeof raw.content !== 'string') return null
  const childrenIds = Array.isArray(raw.childrenIds)
    ? raw.childrenIds.filter((c): c is string => typeof c === 'string')
    : []
  const legacySelectedText = typeof raw.selectedText === 'string' ? raw.selectedText : undefined
  const selectedTexts = Array.isArray(raw.selectedTexts)
    ? raw.selectedTexts.filter((t): t is string => typeof t === 'string')
    : legacySelectedText !== undefined ? [legacySelectedText] : undefined
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : undefined,
    reasoningDuration: typeof raw.reasoningDuration === 'number' ? raw.reasoningDuration : undefined,
    selectedTexts,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    childrenIds,
  }
}

// Repair a conversation loaded from disk: validate every node shape, drop
// unreachable/orphan nodes, prune dangling childrenIds, restore a valid
// rootId / activeNodeId. Never throws — corrupt data yields an empty tree.
export function normalizeConversation(conv: Conversation): Conversation {
  const rawNodes = (conv && typeof conv === 'object' && conv.nodes && typeof conv.nodes === 'object')
    ? conv.nodes as unknown as Record<string, unknown>
    : {}

  const nodes: Record<string, ChatNode> = {}
  for (const [key, value] of Object.entries(rawNodes)) {
    const node = sanitizeNode(value)
    if (node) nodes[key] = node
  }

  // 只保留从 rootId 可达的节点（孤儿/环一律剔除）
  const reachable = new Set<string>()
  const stack: string[] = typeof conv.rootId === 'string' && nodes[conv.rootId] ? [conv.rootId] : []
  while (stack.length) {
    const id = stack.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const node = nodes[id]
    if (!node) continue
    for (const childId of node.childrenIds) {
      if (nodes[childId]) stack.push(childId)
    }
  }

  const kept: Record<string, ChatNode> = {}
  for (const id of reachable) {
    const node = nodes[id]
    const filtered = node.childrenIds.filter((cid) => reachable.has(cid))
    kept[id] = filtered.length === node.childrenIds.length ? node : { ...node, childrenIds: filtered }
  }

  const rootId = typeof conv.rootId === 'string' && kept[conv.rootId]
    ? conv.rootId
    : (Object.keys(kept)[0] ?? null)
  const activeNodeId = typeof conv.activeNodeId === 'string' && kept[conv.activeNodeId]
    ? conv.activeNodeId
    : rootId

  return {
    id: typeof conv.id === 'string' ? conv.id : `conv-${Date.now()}`,
    title: typeof conv.title === 'string' ? conv.title : 'New Chat',
    createdAt: typeof conv.createdAt === 'number' ? conv.createdAt : Date.now(),
    updatedAt: typeof conv.updatedAt === 'number' ? conv.updatedAt : Date.now(),
    nodes: kept,
    rootId,
    activeNodeId,
  }
}
