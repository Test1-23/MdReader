import type { Conversation } from './conversationTree'
import { getPath } from './conversationTree'

// 对话 → API 请求消息的构造。从 conversationTree 拆出：树模型与提示词组装
// 是两件事，后者改动（截断策略、引用格式）不应触碰数据层。

export interface ChatMessage {
  role: string
  content: string
}

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
): ChatMessage[] {
  const path = getPath(conv, nodeId)
  const messages: ChatMessage[] = []

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
