import type { Conversation } from './conversationTree'
import { normalizeConversation } from './conversationTree'
import { reportError } from './errorReporting'

// E2: single guarded call site for saving conversations (used 8+ places).
// 失败必须可见：静默失败会让用户以为对话已保存，实际在关闭窗口时丢失。
export function persistConversation(conv: Conversation): Promise<boolean> {
  const api = window.electronAPI
  if (!conv.rootId || !api?.saveConversation) return Promise.resolve(false)
  return api.saveConversation(conv.id, conv).then(
    () => true,
    (err: unknown) => {
      reportError(`保存对话失败：${err instanceof Error ? err.message : String(err)}`, err)
      return false
    },
  )
}

// E17: one validation standard for loading conversations. Invalid data is
// repaired via normalizeConversation (which never throws).
export async function loadValidatedConversation(id: string): Promise<Conversation | null> {
  try {
    const data = await window.electronAPI?.loadConversation(id)
    if (!data || typeof data !== 'object' || !('nodes' in data) || !('rootId' in data) || !('id' in data)) {
      return null
    }
    return normalizeConversation(data as Conversation)
  } catch (err) {
    reportError(`加载对话失败：${err instanceof Error ? err.message : String(err)}`, err)
    return null
  }
}
