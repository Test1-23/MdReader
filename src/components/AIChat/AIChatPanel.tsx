import { useState, useCallback, useRef, useEffect } from 'react'
import { useLayoutContext, useUIContext } from '../../context/AppContext'
import {
  createConversation, addUserNode, addAssistantNode, switchBranch, buildMessages,
  getAssistantReply, replaceNodeContent, replaceAssistantReply, appendAssistantContent,
  appendAssistantReasoning,
} from '../../utils/conversationTree'
import { findGroupContainingTab } from '../../utils/layout'
import { ChatView } from './ChatView'
import { ChatTreeView } from './ChatTreeView'
import { ChatInput } from './ChatInput'
import { ConversationList } from './ConversationList'

type ChatViewMode = 'chat' | 'tree' | 'list'

interface AIChatPanelProps {
  tabId: string // 本窗口在布局树中的 tab id（用于关闭）
}

export function AIChatPanel({ tabId }: AIChatPanelProps) {
  const { state: uiState, dispatch: uiDispatch } = useUIContext()
  const { state: layoutState, dispatch: layoutDispatch } = useLayoutContext()
  const [streaming, setStreaming] = useState(false)
  const [viewMode, setViewMode] = useState<ChatViewMode>('chat')
  const requestIdRef = useRef<string | null>(null)
  const reasoningStartRef = useRef<number>(0)

  const selectedText = uiState.selectedText
  const conv = uiState.aiConversation ?? createConversation()

  const setConv = useCallback((next: typeof conv) => {
    uiDispatch({ type: 'SET_AI_CONVERSATION', payload: next })
  }, [uiDispatch])

  // ---- 当前文档全文（喂给 AI 的上下文）----
  const docContentRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!layoutState.layoutRoot || !layoutState.activeTabId) {
      docContentRef.current = undefined
      return
    }
    const group = findGroupContainingTab(layoutState.layoutRoot, layoutState.activeTabId)
    const tab = group?.tabs.find((t) => t.id === layoutState.activeTabId)
    const file = tab ? layoutState.openFiles[tab.fileId] : undefined
    docContentRef.current = file?.content
  }, [layoutState.layoutRoot, layoutState.activeTabId, layoutState.openFiles])

  // ---- 流式请求封装：为该 user 节点发起流式生成，chunk 增量追加 ----
  const streamAi = useCallback(async (currentConv: typeof conv, userNodeId: string): Promise<typeof conv> => {
    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    requestIdRef.current = requestId
    reasoningStartRef.current = 0
    setStreaming(true)

    // 创建/复用空 assistant 节点（流式填充）
    let working = currentConv
    const existing = getAssistantReply(currentConv, userNodeId)
    working = existing ? replaceAssistantReply(working, userNodeId, '') : addAssistantNode(working, '', userNodeId)
    setConv(working)

    const userNode = working.nodes[userNodeId]
    const messages = buildMessages(working, userNodeId, userNode.content, userNode.selectedText, docContentRef.current)
    const config = { endpoint: uiState.apiEndpoint, apiKey: uiState.apiKey, model: uiState.apiModel }

    if (!window.electronAPI?.aiChatStream) {
      // Dev fallback
      working = appendAssistantContent(working, userNodeId, `[DEV MODE] AI not available. You asked: "${userNode.content.slice(0, 100)}"`)
      setConv(working)
      setStreaming(false)
      requestIdRef.current = null
      return working
    }

    await new Promise<void>((resolve) => {
      const offChunk = window.electronAPI!.onAiChunk!(({ requestId: rid, delta }) => {
        if (rid !== requestId) return
        working = appendAssistantContent(working, userNodeId, delta)
        setConv(working)
      })
      const offReasoning = window.electronAPI!.onAiReasoning!(({ requestId: rid, delta }) => {
        if (rid !== requestId) return
        if (!reasoningStartRef.current) reasoningStartRef.current = Date.now()
        working = appendAssistantReasoning(working, userNodeId, delta)
        setConv(working)
      })
      const offDone = window.electronAPI!.onAiDone!(({ requestId: rid }) => {
        if (rid !== requestId) return
        // 写入深度思考耗时
        if (reasoningStartRef.current) {
          const duration = Date.now() - reasoningStartRef.current
          const reply = getAssistantReply(working, userNodeId)
          if (reply) {
            const nodes = { ...working.nodes, [reply.id]: { ...reply, reasoningDuration: duration } }
            working = { ...working, nodes, updatedAt: Date.now() }
            setConv(working)
          }
        }
        offChunk(); offReasoning(); offDone(); offError()
        resolve()
      })
      const offError = window.electronAPI!.onAiError!(({ requestId: rid, message }) => {
        if (rid !== requestId) return
        working = appendAssistantContent(working, userNodeId, `\n\nError: ${message}`)
        setConv(working)
        offChunk(); offReasoning(); offDone(); offError()
        resolve()
      })
      window.electronAPI!.aiChatStream(requestId, messages as any, config)
    })

    setStreaming(false)
    requestIdRef.current = null
    return working
  }, [setConv, uiState.apiEndpoint, uiState.apiKey, uiState.apiModel])

  // ---- 停止生成 ----
  const handleStop = useCallback(() => {
    if (requestIdRef.current) {
      window.electronAPI?.cancelAiStream(requestIdRef.current)
      requestIdRef.current = null
    }
  }, [])

  // ---- 发送 ----
  const handleSend = useCallback(async (message: string) => {
    // Always add the user node first — the message must be visible
    const updated = addUserNode(conv, message, selectedText || undefined)
    setConv(updated)

    // Missing API config → show a helpful message instead of silently failing
    if (!uiState.apiEndpoint || !uiState.apiKey || !uiState.apiModel) {
      const hint = '⚠️ AI 未配置：请先点击 ⚙️ 图标，在设置中填写 API Endpoint、API Key 和 Model。'
      setConv(addAssistantNode(updated, hint))
      return
    }

    try {
      const withReply = await streamAi(updated, updated.activeNodeId!)
      if (window.electronAPI?.saveConversation) {
        window.electronAPI.saveConversation(withReply.id, withReply)
      }
    } catch (err: any) {
      setConv(replaceAssistantReply(updated, updated.activeNodeId!, `Error: ${err.message || 'Unknown error'}`))
    }
  }, [conv, selectedText, uiState.apiEndpoint, uiState.apiKey, uiState.apiModel, setConv, streamAi])

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

  // ---- 重发 / 重新生成 ----
  const handleRegenerate = useCallback(async (nodeId: string) => {
    const node = conv.nodes[nodeId]
    if (!node) return
    const userNodeId = node.role === 'user'
      ? node.id
      : (node.parentId && conv.nodes[node.parentId]?.role === 'user' ? node.parentId : null)
    if (!userNodeId) return

    try {
      const withReply = await streamAi(conv, userNodeId)
      if (window.electronAPI?.saveConversation) {
        window.electronAPI.saveConversation(withReply.id, withReply)
      }
    } catch (err: any) {
      setConv(replaceAssistantReply(conv, userNodeId, `Error: ${err.message || 'Unknown error'}`))
    }
  }, [conv, setConv, streamAi])

  // ---- 编辑 + 重新发送 ----
  const handleEdit = useCallback(async (nodeId: string, newText: string) => {
    const updated = replaceNodeContent(conv, nodeId, newText)
    setConv(updated)

    if (!uiState.apiEndpoint || !uiState.apiKey || !uiState.apiModel) {
      const hint = '⚠️ AI 未配置：请先点击 ⚙️ 图标，在设置中填写 API Endpoint、API Key 和 Model。'
      setConv(addAssistantNode(updated, hint, nodeId))
      return
    }

    try {
      const withReply = await streamAi(updated, nodeId)
      if (window.electronAPI?.saveConversation) {
        window.electronAPI.saveConversation(withReply.id, withReply)
      }
    } catch (err: any) {
      setConv(replaceAssistantReply(updated, nodeId, `Error: ${err.message || 'Unknown error'}`))
    }
  }, [conv, setConv, uiState.apiEndpoint, uiState.apiKey, uiState.apiModel, streamAi])

  // ---- 关闭窗口（回收 pane，对话保留在 context）----
  const handleClose = useCallback(() => {
    if (!layoutState.layoutRoot) return
    const group = findGroupContainingTab(layoutState.layoutRoot, tabId)
    if (group) {
      layoutDispatch({ type: 'CLOSE_TAB', payload: { groupId: group.id, tabId } })
    }
  }, [layoutState.layoutRoot, tabId, layoutDispatch])

  // ---- 对话管理 ----
  const saveCurrentConv = useCallback((c: typeof conv) => {
    if (window.electronAPI?.saveConversation) {
      window.electronAPI.saveConversation(c.id, c)
    }
  }, [])

  const refreshList = useCallback(() => {
    window.electronAPI?.listConversations()?.then((list) => {
      uiDispatch({ type: 'SET_CONVERSATION_LIST', payload: list })
    })
  }, [uiDispatch])

  const handleNewChat = useCallback(() => {
    if (conv.rootId) saveCurrentConv(conv) // 切换前保存当前对话
    setConv(createConversation())
    setViewMode('chat')
    refreshList()
  }, [conv, saveCurrentConv, setConv, refreshList])

  const handleSelectConversation = useCallback(async (id: string) => {
    if (conv.rootId && conv.id !== id) saveCurrentConv(conv)
    const data = await window.electronAPI?.loadConversation(id)
    if (data && typeof data === 'object' && 'nodes' in data) {
      setConv(data as typeof conv)
    }
    setViewMode('chat')
    refreshList()
  }, [conv, saveCurrentConv, setConv, refreshList])

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    const data = await window.electronAPI?.loadConversation(id)
    if (data && typeof data === 'object' && 'nodes' in data) {
      const updated = { ...(data as typeof conv), title }
      await window.electronAPI?.saveConversation(id, updated)
      if (conv.id === id) setConv(updated)
      refreshList()
    }
  }, [conv.id, setConv, refreshList])

  const handleDeleteConversation = useCallback(async (id: string) => {
    await window.electronAPI?.deleteConversation(id)
    if (conv.id === id) {
      setConv(createConversation())
      setViewMode('chat')
    }
    refreshList()
  }, [conv.id, setConv, refreshList])

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
              ${viewMode === 'chat' ? 'bg-blue-500 text-white' : 'text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'}
            `}
            title="Chat View"
          >
            💬
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${viewMode === 'tree' ? 'bg-blue-500 text-white' : 'text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'}
            `}
            title="Tree View"
          >
            🌳
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'}
            `}
            title="Conversations"
          >
            🗂
          </button>
        </div>

        {/* 新建对话 */}
        <button
          onClick={handleNewChat}
          className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400"
          title="New Chat"
        >
          +
        </button>
        {/* 关闭窗口 */}
        <button
          onClick={handleClose}
          className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400"
          title="Close Window"
        >
          ×
        </button>
      </div>

      {/* 视图内容 */}
      {viewMode === 'list' ? (
        <ConversationList
          conv={conv}
          onSelect={handleSelectConversation}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
          onNew={handleNewChat}
        />
      ) : viewMode === 'chat' ? (
        <ChatView
          conv={conv}
          activeNodeId={conv.activeNodeId}
          loading={streaming}
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
        streaming={streaming}
        onStop={handleStop}
      />
    </div>
  )
}
