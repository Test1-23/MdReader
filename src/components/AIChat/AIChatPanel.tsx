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
import { persistConversation, loadValidatedConversation } from './conversationPersistence'
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
  const { state: uiState, dispatch: uiDispatch } = useUIContext()
  const { state: aiState, dispatch: aiDispatch } = useAIContext()
  const { state: layoutState, dispatch: layoutDispatch } = useLayoutContext()
  const [viewMode, setViewMode] = useState<ChatViewMode>('chat')
  const deepThinkRef = useRef(false)

  const selectedText = aiState.selectedText
  const conv = aiState.aiConversation ?? createConversation()

  // Fix 1b: 首次挂载若无对话，创建并写回 context（保证 id 稳定，不再每次渲染生成临时对话）
  useEffect(() => {
    if (!aiState.aiConversation) {
      aiDispatch({ type: 'SET_AI_CONVERSATION', payload: createConversation() })
    }
  }, [aiState.aiConversation, aiDispatch])

  // 函数式 setConv —— useAiStream 需要原子更新 + 会话 id 守卫（B2）
  const setConv = useCallback((updater: ConvUpdater) => {
    aiDispatch({ type: 'SET_AI_CONVERSATION', payload: updater })
  }, [aiDispatch])

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
  const selectedTextRef = useRef(selectedText)
  selectedTextRef.current = selectedText
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
    // Always add the user node first — the message must be visible
    const updated = addUserNode(current, message, selectedTextRef.current || undefined)
    setConv(updated)

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
  }, [setConv, stream])

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

  // ---- 关闭窗口（回收 pane，对话保留在 context）----
  const handleClose = useCallback(() => {
    if (!layoutState.layoutRoot) return
    if (conv.rootId) persistConversation(conv)
    const group = findGroupContainingTab(layoutState.layoutRoot, tabId)
    if (group) {
      layoutDispatch({ type: 'CLOSE_TAB', payload: { groupId: group.id, tabId } })
    }
  }, [layoutState.layoutRoot, tabId, layoutDispatch, conv])

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
    if (convRef.current.id === id) {
      setConv(createConversation())
      setViewMode('chat')
    }
    refreshList()
  }, [setConv, refreshList, stream])

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
        selectedText={selectedText}
        onSend={handleSend}
        streaming={stream.streaming}
        onStop={handleStop}
      />
    </div>
  )
}
