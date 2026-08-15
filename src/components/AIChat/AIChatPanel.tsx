import { useState, useCallback, useRef, useEffect } from 'react'
import { useLayoutContext, useUIContext, useAIContext } from '../../context/AppContext'
import {
  createConversation, addUserNode, addAssistantNode, switchBranch, getAssistantReply,
  replaceNodeContent, replaceAssistantReply,
} from '../../utils/conversationTree'
import type { Conversation } from '../../utils/conversationTree'
import { findGroupContainingTab } from '../../utils/layout'
import { useAiStream } from '../../hooks/useAiStream'
import type { ConvUpdater } from '../../hooks/useAiStream'
import { useDebouncedPersist } from '../../hooks/useDebouncedPersist'
import { persistConversation, loadValidatedConversation } from '../../utils/conversationPersistence'
import { VIEW_BTN_INACTIVE } from '../shared/classes'
import { ChatView } from './ChatView'
import { ChatTreeView } from './ChatTreeView'
import { ChatInput } from './ChatInput'
import { ConversationList } from './ConversationList'

type ChatViewMode = 'chat' | 'tree' | 'list'

interface AIChatPanelProps {
  tabId: string // 本窗口在布局树中的 tab id（用于关闭）
}

const CONFIG_HINT = '⚠️ AI 未配置：请先点击 ⚙️ 图标，在设置中填写 API Endpoint、API Key 和 Model。'

export function AIChatPanel({ tabId }: AIChatPanelProps) {
  const { state: uiState } = useUIContext()
  const { state: aiState, dispatch: aiDispatch } = useAIContext()
  const { state: layoutState, dispatch: layoutDispatch } = useLayoutContext()
  const [viewMode, setViewMode] = useState<ChatViewMode>('chat')
  const deepThinkRef = useRef(false)

  // 多窗口独立对话：本窗口的对话按 tabId 键控
  const conv = aiState.aiConversations[tabId] ?? createConversation()

  // 首次挂载领取本窗口对话：优先继承启动恢复的最后对话（原子领取），否则新建；
  // 条目被删除（如删除他窗口打开的同一对话）时自愈重建
  useEffect(() => {
    if (!aiState.aiConversations[tabId]) {
      aiDispatch({ type: 'CLAIM_STARTUP_CONVERSATION', payload: { tabId } })
    }
  }, [aiState.aiConversations, tabId, aiDispatch])

  // 函数式 setConv —— useAiStream 需要原子更新 + 会话 id 守卫（B2）
  const setConv = useCallback((updater: ConvUpdater) => {
    aiDispatch({ type: 'SET_AI_CONVERSATION', payload: { tabId, value: updater } })
  }, [tabId, aiDispatch])

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

  // ---- 流式状态机（R1）：生命周期、竞态防护、chunk 批处理全部收敛于此 ----
  const stream = useAiStream({
    setConv,
    getConfig: () => ({
      endpoint: uiState.apiEndpoint,
      model: uiState.apiModel,
      thinking: deepThinkRef.current,
    }),
    getDocContent: () => docContentRef.current,
    onStopped: (finalConv) => persistConversation(finalConv),
  })

  // ---- handler 稳定化（配合 ChatView/ChatBubble memo）——
  // 全部经 ref 读取最新值，依赖数组为空，身份跨渲染恒定
  const convRef = useRef<Conversation>(conv)
  convRef.current = conv
  const pendingQuotesRef = useRef(aiState.pendingQuotes)
  pendingQuotesRef.current = aiState.pendingQuotes
  const uiSettingsRef = useRef({ endpoint: uiState.apiEndpoint, keySaved: uiState.apiKeySaved, model: uiState.apiModel })
  uiSettingsRef.current = { endpoint: uiState.apiEndpoint, keySaved: uiState.apiKeySaved, model: uiState.apiModel }

  // ---- 停止生成（B1：取消事件会 resolve 流 Promise，UI 自动恢复）----
  const handleStop = useCallback(() => {
    stream.stop()
    // 部分内容经 onStopped 保存（cancelled 事件到达时）
  }, [stream])

  // ---- 发送 ----
  const handleSend = useCallback(async (message: string, thinking: boolean) => {
    deepThinkRef.current = thinking
    const current = convRef.current
    const settings = uiSettingsRef.current
    // 多引用：所有待发引用附到本条消息，发送后清空（全局，所有窗口同步）
    const quotes = pendingQuotesRef.current
    const updated = addUserNode(current, message, quotes.length > 0 ? quotes.map((q) => q.text) : undefined)
    setConv(updated)
    aiDispatch({ type: 'CLEAR_QUOTES' })

    // Missing API config → show a helpful message instead of silently failing
    if (!settings.endpoint || !settings.keySaved || !settings.model) {
      const reply = getAssistantReply(updated, updated.activeNodeId!)
      setConv(reply
        ? replaceAssistantReply(updated, updated.activeNodeId!, CONFIG_HINT)
        : addAssistantNode(updated, CONFIG_HINT))
      return
    }

    try {
      const withReply = await stream.start(updated, updated.activeNodeId!)
      persistConversation(withReply)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setConv((prev) => replaceAssistantReply(prev, updated.activeNodeId!, `Error: ${msg}`))
    }
  }, [setConv, stream, aiDispatch])

  // ---- 分支切换（B2：流式期间先取消当前流）----
  const debouncedSave = useDebouncedPersist()

  const handleSwitchBranch = useCallback((nodeId: string) => {
    stream.stop()
    const next = switchBranch(convRef.current, nodeId)
    setConv(next)
    debouncedSave(next)
  }, [setConv, debouncedSave, stream])

  // 树形图点击节点 → 回溯到该对的 AI 回复节点（若无回复则回到 user 节点），并切回聊天视图
  const handleSelectTreeNode = useCallback((nodeId: string) => {
    const current = convRef.current
    const reply = getAssistantReply(current, nodeId)
    setConv(switchBranch(current, reply ? reply.id : nodeId))
    setViewMode('chat')
  }, [setConv])

  const handleCopy = useCallback(async (nodeId: string) => {
    const node = convRef.current.nodes[nodeId]
    if (!node) return
    try {
      await navigator.clipboard.writeText(node.content)
    } catch {
      console.warn('Copy failed')
    }
  }, [])

  // ---- 重发 / 重新生成 ----
  const handleRegenerate = useCallback(async (nodeId: string) => {
    const current = convRef.current
    const node = current.nodes[nodeId]
    if (!node) return
    const userNodeId = node.role === 'user'
      ? node.id
      : (node.parentId && current.nodes[node.parentId]?.role === 'user' ? node.parentId : null)
    if (!userNodeId) return

    try {
      const withReply = await stream.start(current, userNodeId)
      persistConversation(withReply)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setConv((prev) => replaceAssistantReply(prev, userNodeId, `Error: ${msg}`))
    }
  }, [setConv, stream])

  // ---- 编辑 + 重新发送 ----
  const handleEdit = useCallback(async (nodeId: string, newText: string) => {
    const settings = uiSettingsRef.current
    const updated = replaceNodeContent(convRef.current, nodeId, newText)
    setConv(updated)

    if (!settings.endpoint || !settings.keySaved || !settings.model) {
      const reply = getAssistantReply(updated, nodeId)
      setConv(reply ? replaceAssistantReply(updated, nodeId, CONFIG_HINT) : addAssistantNode(updated, CONFIG_HINT, nodeId))
      return
    }

    try {
      const withReply = await stream.start(updated, nodeId)
      persistConversation(withReply)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setConv((prev) => replaceAssistantReply(prev, nodeId, `Error: ${msg}`))
    }
  }, [setConv, stream])

  // ---- 关闭窗口（回收 pane；持久化由 AppContext 的 GC 效果负责——
  // 它保存的是最新 reducer state 而非此处的渲染快照）----
  const handleClose = useCallback(() => {
    if (!layoutState.layoutRoot) return
    const group = findGroupContainingTab(layoutState.layoutRoot, tabId)
    if (group) {
      layoutDispatch({ type: 'CLOSE_TAB', payload: { groupId: group.id, tabId } })
    }
  }, [layoutState.layoutRoot, tabId, layoutDispatch])

  // 窗口关闭前保存当前对话（P9: ref 读取最新值，流式期间不再每 chunk 重挂监听器）
  useEffect(() => {
    const save = () => {
      const c = convRef.current
      if (c.rootId) persistConversation(c)
    }
    window.addEventListener('beforeunload', save)
    return () => window.removeEventListener('beforeunload', save)
  }, [])

  const refreshList = useCallback(() => {
    window.electronAPI?.listConversations()?.then((list) => {
      aiDispatch({ type: 'SET_CONVERSATION_LIST', payload: list })
    }).catch(() => {})
  }, [aiDispatch])

  const handleNewChat = useCallback(() => {
    stream.stop()
    if (convRef.current.rootId) persistConversation(convRef.current)
    setConv(createConversation())
    setViewMode('chat')
    refreshList()
  }, [setConv, refreshList, stream])

  const handleSelectConversation = useCallback(async (id: string) => {
    // B2: switching conversations mid-stream must not let stale chunks
    // resurrect the old one — cancel first, the id guard covers the rest.
    const current = convRef.current
    if (current.id !== id) stream.stop()
    if (current.rootId && current.id !== id) persistConversation(current)
    const data = await loadValidatedConversation(id)
    if (data) setConv(data)
    setViewMode('chat')
    refreshList()
  }, [setConv, refreshList, stream])

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    const current = convRef.current
    // B15: renaming the current conversation must use the in-memory version —
    // re-reading from disk would clobber unsaved messages with a stale snapshot.
    if (current.id === id) {
      const updated = { ...current, title }
      setConv(updated)
      persistConversation(updated)
      refreshList()
      return
    }
    const data = await loadValidatedConversation(id)
    if (data) {
      await window.electronAPI?.saveConversation(id, { ...data, title })
      refreshList()
    }
  }, [setConv, refreshList])

  const handleDeleteConversation = useCallback(async (id: string) => {
    if (convRef.current.id === id) stream.stop()
    await window.electronAPI?.deleteConversation(id)
    // 全窗口同步：任何持有该对话的 AI 窗口都重置（claim 效果自愈新建），
    // 防止"已删对话复活"被再次落盘
    aiDispatch({ type: 'REMOVE_CONVERSATION_BY_ID', payload: { convId: id } })
    if (convRef.current.id === id) {
      setViewMode('chat')
    }
    refreshList()
  }, [aiDispatch, refreshList, stream])

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
              ${viewMode === 'chat' ? 'bg-blue-500 text-white' : VIEW_BTN_INACTIVE}
            `}
            title="Chat View"
          >
            💬
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${viewMode === 'tree' ? 'bg-blue-500 text-white' : VIEW_BTN_INACTIVE}
            `}
            title="Tree View"
          >
            🌳
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`
              w-6 h-6 flex items-center justify-center rounded text-[10px] transition-colors
              ${viewMode === 'list' ? 'bg-blue-500 text-white' : VIEW_BTN_INACTIVE}
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
          loading={stream.streaming}
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
        pendingQuotes={aiState.pendingQuotes}
        onRemoveQuote={(id) => aiDispatch({ type: 'REMOVE_QUOTE', payload: { id } })}
        onSend={handleSend}
        streaming={stream.streaming}
        onStop={handleStop}
      />
    </div>
  )
}
