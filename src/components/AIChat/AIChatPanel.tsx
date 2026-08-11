import { useState, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import {
  createConversation, addUserNode, addAssistantNode, switchBranch, buildMessages,
  getAssistantReply, replaceNodeContent, replaceAssistantReply,
} from '../../utils/conversationTree'
import type { Conversation } from '../../utils/conversationTree'
import { ChatView } from './ChatView'
import { ChatTreeView } from './ChatTreeView'
import { ChatInput } from './ChatInput'

type ChatViewMode = 'chat' | 'tree'

const positionClasses: Record<string, string> = {
  right: 'border-l border-gray-300 dark:border-gray-700 w-80 min-w-[240px]',
  left: 'border-r border-gray-300 dark:border-gray-700 w-80 min-w-[240px]',
  bottom: 'border-t border-gray-300 dark:border-gray-700 h-60 w-full',
}

export function AIChatPanel() {
  const { state, dispatch } = useAppContext()
  const [conv, setConv] = useState<Conversation>(() => createConversation())
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ChatViewMode>('chat')

  const selectedText = state.selectedText
  const position = state.chatPosition

  const handleSend = useCallback(async (message: string) => {
    setLoading(true)

    // Always add the user node first — the message must be visible
    const updated = addUserNode(conv, message, selectedText || undefined)
    setConv(updated)

    // Missing API config → show a helpful message instead of silently failing
    if (!state.apiEndpoint || !state.apiKey || !state.apiModel) {
      const hint = '⚠️ AI 未配置：请先点击 ⚙️ 图标，在设置中填写 API Endpoint、API Key 和 Model。'
      setConv(addAssistantNode(updated, hint))
      setLoading(false)
      return
    }

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
        reply = `[DEV MODE] AI not available. You asked: "${message}"\n\nSelected text: "${selectedText?.slice(0, 100) || 'none'}"`
      }

      const withReply = addAssistantNode(updated, reply)
      setConv(withReply)

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

  // 树形图点击节点 → 回溯到该对的 AI 回复节点（若无回复则回到 user 节点），并切回聊天视图
  const handleSelectTreeNode = useCallback((nodeId: string) => {
    setConv((prev) => {
      const reply = getAssistantReply(prev, nodeId)
      return switchBranch(prev, reply ? reply.id : nodeId)
    })
    setViewMode('chat')
  }, [])

  // ---- 复制 ----
  const handleCopy = useCallback(async (nodeId: string) => {
    const node = conv.nodes[nodeId]
    if (!node) return
    try {
      await navigator.clipboard.writeText(node.content)
    } catch {
      console.warn('Copy failed')
    }
  }, [conv])

  // ---- 通用：为该 user 节点请求 AI 并覆盖/添加回复 ----
  const requestAiForUserNode = useCallback(async (currentConv: Conversation, userNodeId: string): Promise<Conversation> => {
    const userNode = currentConv.nodes[userNodeId]
    if (!userNode) return currentConv
    const messages = buildMessages(currentConv, userNodeId, userNode.content, userNode.selectedText)

    let reply: string
    if (window.electronAPI?.aiChat) {
      const config = { endpoint: state.apiEndpoint, apiKey: state.apiKey, model: state.apiModel }
      reply = await window.electronAPI.aiChat(messages as any, config)
    } else {
      reply = `[DEV MODE] AI not available. You asked: "${userNode.content.slice(0, 100)}"`
    }

    const existingReply = getAssistantReply(currentConv, userNodeId)
    return existingReply
      ? replaceAssistantReply(currentConv, userNodeId, reply)
      : addAssistantNode(currentConv, reply, userNodeId)
  }, [state.apiEndpoint, state.apiKey, state.apiModel])

  // ---- 重发 / 重新生成 ----
  const handleRegenerate = useCallback(async (nodeId: string) => {
    // 解析出 user 节点：assistant 节点取其父 user 节点
    const node = conv.nodes[nodeId]
    if (!node) return
    const userNodeId = node.role === 'user'
      ? node.id
      : (node.parentId && conv.nodes[node.parentId]?.role === 'user' ? node.parentId : null)
    if (!userNodeId) return

    setLoading(true)
    try {
      const withReply = await requestAiForUserNode(conv, userNodeId)
      setConv(withReply)
      if (window.electronAPI?.saveConversation) {
        window.electronAPI.saveConversation(withReply.id, withReply)
      }
    } catch (err: any) {
      const errorMsg = `Error: ${err.message || 'Unknown error'}`
      const withError = replaceAssistantReply(conv, userNodeId, errorMsg)
      setConv(withError)
    } finally {
      setLoading(false)
    }
  }, [conv, requestAiForUserNode])

  // ---- 编辑 + 重新发送 ----
  const handleEdit = useCallback(async (nodeId: string, newText: string) => {
    setLoading(true)
    const updated = replaceNodeContent(conv, nodeId, newText)
    setConv(updated)

    if (!state.apiEndpoint || !state.apiKey || !state.apiModel) {
      const hint = '⚠️ AI 未配置：请先点击 ⚙️ 图标，在设置中填写 API Endpoint、API Key 和 Model。'
      setConv(addAssistantNode(updated, hint, nodeId))
      setLoading(false)
      return
    }

    try {
      const withReply = await requestAiForUserNode(updated, nodeId)
      setConv(withReply)
      if (window.electronAPI?.saveConversation) {
        window.electronAPI.saveConversation(withReply.id, withReply)
      }
    } catch (err: any) {
      const errorMsg = `Error: ${err.message || 'Unknown error'}`
      setConv(replaceAssistantReply(updated, nodeId, errorMsg))
    } finally {
      setLoading(false)
    }
  }, [conv, state.apiEndpoint, state.apiKey, state.apiModel, requestAiForUserNode])

  return (
    <div className={`${positionClasses[position]} bg-white dark:bg-gray-900 flex flex-col`}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex-1">
          💬 AI Chat
        </h3>

        {/* 视图切换 */}
        <div className="flex gap-0.5">
          <button
            onClick={() => setViewMode('chat')}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${viewMode === 'chat' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}
            `}
            title="Chat View"
          >
            💬
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${viewMode === 'tree' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}
            `}
            title="Tree View"
          >
            🌳
          </button>
        </div>

        {/* 位置选择器 */}
        <div className="flex gap-0.5">
          <button
            onClick={() => dispatch({ type: 'SET_CHAT_POSITION', payload: 'left' })}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${position === 'left' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}
            `}
            title="Left"
          >
            ⇠
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_CHAT_POSITION', payload: 'right' })}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${position === 'right' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}
            `}
            title="Right"
          >
            ⇢
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_CHAT_POSITION', payload: 'bottom' })}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${position === 'bottom' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}
            `}
            title="Bottom"
          >
            ⇣
          </button>
        </div>

        {/* 新建对话 */}
        <button
          onClick={() => setConv(createConversation())}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="New Chat"
        >
          +
        </button>
      </div>

      {/* 视图内容 */}
      {viewMode === 'chat' ? (
        <ChatView
          conv={conv}
          activeNodeId={conv.activeNodeId}
          onSwitchBranch={handleSwitchBranch}
          onCopy={handleCopy}
          onRegenerate={handleRegenerate}
          onEdit={handleEdit}
        />
      ) : (
        <ChatTreeView
          conv={conv}
          activeNodeId={conv.activeNodeId}
          onSelectNode={handleSelectTreeNode}
        />
      )}

      {/* Input */}
      <ChatInput
        selectedText={selectedText}
        onSend={handleSend}
        disabled={loading}
      />
    </div>
  )
}
