import type { Conversation } from '../../utils/conversationTree'
import { normalizeConversation } from '../../utils/conversationTree'

// E2: single guarded call site for saving conversations (used 8+ places).
export function persistConversation(conv: Conversation): void {
  if (conv.rootId && window.electronAPI?.saveConversation) {
    window.electronAPI.saveConversation(conv.id, conv)
  }
}

// E17: one validation standard for loading conversations (select + rename use
// different strengths today). Invalid data is repaired via normalizeConversation.
export async function loadValidatedConversation(id: string): Promise<Conversation | null> {
  const data = await window.electronAPI?.loadConversation(id)
  if (!data || typeof data !== 'object' || !('nodes' in data) || !('rootId' in data) || !('id' in data)) {
    return null
  }
  return normalizeConversation(data as Conversation)
}
