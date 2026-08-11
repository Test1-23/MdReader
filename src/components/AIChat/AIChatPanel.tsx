import { useState, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import { createConversation, addUserNode, addAssistantNode, switchBranch, buildMessages } from '../../utils/conversationTree'
import type { Conversation } from '../../utils/conversationTree'
import { ConversationTree } from './ConversationTree'
import { ChatInput } from './ChatInput'

export function AIChatPanel() {
  const { state } = useAppContext()
  const [conv, setConv] = useState<Conversation>(() => createConversation())
  const [loading, setLoading] = useState(false)

  const selectedText = state.selectedText

  const handleSend = useCallback(async (message: string) => {
    if (!state.apiEndpoint || !state.apiKey || !state.apiModel) {
      // No API config — just log
      console.warn('AI Chat: No API config set')
      return
    }

    setLoading(true)

    // Add user node
    const updated = addUserNode(conv, message, selectedText || undefined)
    setConv(updated)

    try {
      const messages = buildMessages(updated, updated.activeNodeId!, message, selectedText || undefined)

      const config = {
        endpoint: state.apiEndpoint,
        apiKey: state.apiKey,
        model: state.apiModel,
      }

      let reply: string
      if (window.electronAPI?.aiChat) {
        reply = await window.electronAPI.aiChat(messages as any, config)
      } else {
        // Fallback for browser dev mode
        reply = `[DEV MODE] AI not available. You asked: "${message}"\n\nSelected text: "${selectedText?.slice(0, 100) || 'none'}"`
      }

      const withReply = addAssistantNode(updated, reply)
      setConv(withReply)

      // Save conversation
      if (window.electronAPI?.saveConversation) {
        window.electronAPI.saveConversation(withReply.id, withReply)
      }
    } catch (err: any) {
      const errorMsg = `Error: ${err.message || 'Unknown error'}`
      const withError = addAssistantNode(updated, errorMsg)
      setConv(withError)
    } finally {
      setLoading(false)
    }
  }, [conv, selectedText, state.apiEndpoint, state.apiKey, state.apiModel])

  const handleSwitchBranch = useCallback((nodeId: string) => {
    setConv((prev) => switchBranch(prev, nodeId))
  }, [])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-300 dark:border-gray-700 w-80 min-w-[240px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          💬 AI Chat
        </h3>
        <button
          onClick={() => setConv(createConversation())}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="New Chat"
        >
          +
        </button>
      </div>

      {/* Conversation Tree */}
      <ConversationTree
        conv={conv}
        activeNodeId={conv.activeNodeId}
        onSwitchBranch={handleSwitchBranch}
      />

      {/* Input */}
      <ChatInput
        selectedText={selectedText}
        onSend={handleSend}
        disabled={loading}
      />
    </div>
  )
}
