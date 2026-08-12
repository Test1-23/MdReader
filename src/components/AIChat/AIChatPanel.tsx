import { useState, useCallback } from 'react'
import { useLayoutContext, useUIContext } from '../../context/AppContext'
import {
  createConversation, addUserNode, addAssistantNode, switchBranch, buildMessages,
  getAssistantReply, replaceNodeContent, replaceAssistantReply,
} from '../../utils/conversationTree'
import { findGroupContainingTab } from '../../utils/layout'
import { ChatView } from './ChatView'
import { ChatTreeView } from './ChatTreeView'
import { ChatInput } from './ChatInput'

type ChatViewMode = 'chat' | 'tree'

interface AIChatPanelProps {
  tabId: string // 本窗口在布局树中的 tab id（用于关闭）
}

export function AIChatPanel({ tabId }: AIChatPanelProps) {
  const { state: uiState, dispatch: uiDispatch } = useUIContext()
  const { state: layoutState, dispatch: layoutDispatch } = useLayoutContext()
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState<ChatViewMode>('chat')

  const selectedText = uiState.selectedText
  const conv = uiState.aiConversation ?? createConversation()

  const setConv = useCallback((next: typeof conv) => {
    uiDispatch({ type: 'SET_AI_CONVERSATION', payload: next })
  }, [uiDispatch])

  const handleSend = useCallback(async (message: string) => {
    setLoading(true)

    // Always add the user node first — the message must be visible
    const updated = addUserNode(conv, message, selectedText || undefined)
    setConv(updated)

    // Missing API config → show a helpful message instead of silently failing
    if (!uiState.apiEndpoint || !uiState.apiKey || !uiState.apiModel) {
      const hint = '⚠️ AI 未配置：请先点击 ⚙️ 图标，在设置中填写 API Endpoint、API Key 和 Model。'
      setConv(addAssistantNode(updated, hint))
      setLoading(false)
      return
    }

    try {
      const messages = buildMessages(updated, updated.activeNodeId!, message, selectedText || undefined)

      const config = {
        endpoint: uiState.apiEndpoint,
        apiKey: uiState.apiKey,
        model: uiState.apiModel,
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
  }, [conv, selectedText, uiState.apiEndpoint, uiState.apiKey, uiState.apiModel, setConv])

  const handleSwitchBranch = useCallback((nodeId: string) => {
    setConv(switchBranch(conv, nodeId))
  }, [conv, setConv])

  // 树形图点击节点 → 回溯到该对的 AI 回复节点（若无回复则回到 user 节点），并切回聊天视图
  const handleSelectTreeNode = useCallback((nodeId: string) => {
    const reply = getAssistantReply(conv, nodeId)
    setConv(switchBranch(conv, reply ? reply.id : nodeId))
    setViewMode('chat')
  }, [conv, setConv])

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
  const requestAiForUserNode = useCallback(async (currentConv: typeof conv, userNodeId: string): Promise<typeof conv> => {
    const userNode = currentConv.nodes[userNodeId]
    if (!userNode) return currentConv
    const messages = buildMessages(currentConv, userNodeId, userNode.content, userNode.selectedText)

    let reply: string
    if (window.electronAPI?.aiChat) {
      const config = { endpoint: uiState.apiEndpoint, apiKey: uiState.apiKey, model: uiState.apiModel }
      reply = await window.electronAPI.aiChat(messages as any, config)
    } else {
      reply = `[DEV MODE] AI not available. You asked: "${userNode.content.slice(0, 100)}"`
    }

    const existingReply = getAssistantReply(currentConv, userNodeId)
    return existingReply
      ? replaceAssistantReply(currentConv, userNodeId, reply)
      : addAssistantNode(currentConv, reply, userNodeId)
  }, [uiState.apiEndpoint, uiState.apiKey, uiState.apiModel])

  // ---- 重发 / 重新生成 ----
  const handleRegenerate = useCallback(async (nodeId: string) => {
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
      setConv(replaceAssistantReply(conv, userNodeId, errorMsg))
    } finally {
      setLoading(false)
    }
  }, [conv, setConv, requestAiForUserNode])

  // ---- 编辑 + 重新发送 ----
  const handleEdit = useCallback(async (nodeId: string, newText: string) => {
    setLoading(true)
    const updated = replaceNodeContent(conv, nodeId, newText)
    setConv(updated)

    if (!uiState.apiEndpoint || !uiState.apiKey || !uiState.apiModel) {
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
  }, [conv, setConv, uiState.apiEndpoint, uiState.apiKey, uiState.apiModel, requestAiForUserNode])

  // ---- 关闭窗口（回收 pane，对话保留在 context）----
  const handleClose = useCallback(() => {
    if (!layoutState.layoutRoot) return
    const group = findGroupContainingTab(layoutState.layoutRoot, tabId)
    if (group) {
      layoutDispatch({ type: 'CLOSE_TAB', payload: { groupId: group.id, tabId } })
    }
  }, [layoutState.layoutRoot, tabId, layoutDispatch])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
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

        {/* 新建对话 */}
        <button
          onClick={() => setConv(createConversation())}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="New Chat"
        >
          +
        </button>
        {/* 关闭窗口 */}
        <button
          onClick={handleClose}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Close Window"
        >
          ×
        </button>
      </div>

      {/* 视图内容 */}
      {viewMode === 'chat' ? (
        <ChatView
          conv={conv}
          activeNodeId={conv.activeNodeId}
          loading={loading}
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
