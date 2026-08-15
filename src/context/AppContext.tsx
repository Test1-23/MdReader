import React, { createContext, useContext, useReducer } from 'react'
import type { LayoutState, LayoutAction, UIState, UIAction, UIStateView, AIChatState } from '../types'
import {
  findGroup,
  findGroupContainingTab,
  transformNode,
  getActiveTab,
  resizeSplit,
  collectAllTabs,
} from '../utils/layout'
import { persistConversation } from '../utils/conversationPersistence'
import { execute } from '../services/layoutService'
import type { LayoutResult } from '../services/layoutService'
import { createConversation, normalizeConversation } from '../utils/conversationTree'
import type { Conversation } from '../utils/conversationTree'
import { AI_WINDOW_ID } from '../utils/windowDescriptor'

// ============================================================
// 双 Context 架构：
// - LayoutContext（低频）：布局树 / openFiles / 文件树 — 变更只重渲染布局消费者
// - UIContext（高频）：拖拽状态 / 选中文本 / 面板 / 主题 / 设置 — 变更只重渲染 UI 消费者
// ============================================================

// ---- Layout State ----

const initialLayout: LayoutState = {
  fileTreeRoot: null,
  fileTree: null,
  sidebarLoading: false,
  layoutRoot: null,
  activeGroupId: null,
  activeTabId: null,
  lastAiTabId: null,
  openFiles: {},
}

function applyLayoutResult(state: LayoutState, result: LayoutResult): LayoutState {
  // P4: a no-op result (validation rejected, or nothing actually changed)
  // must return the same state reference — otherwise every consumer of
  // LayoutContext re-renders for nothing.
  const hasAdds = Object.keys(result.openFilesToAdd ?? {}).length > 0
  const hasRemoves = (result.openFilesToRemove?.length ?? 0) > 0
  if (
    result.layoutRoot === state.layoutRoot
    && result.activeGroupId === state.activeGroupId
    && result.activeTabId === state.activeTabId
    && !hasAdds && !hasRemoves
  ) {
    return state
  }

  let openFiles = state.openFiles
  if (hasAdds) {
    openFiles = { ...openFiles, ...result.openFilesToAdd }
  }
  if (hasRemoves) {
    for (const id of result.openFilesToRemove!) {
      const { [id]: _, ...rest } = openFiles as Record<string, unknown>
      openFiles = rest as unknown as typeof openFiles
    }
  }

  // 最近聚焦的 AI 窗口：任何操作把激活 tab 切到 AI 窗口时记录
  let lastAiTabId = state.lastAiTabId
  if (result.layoutRoot && result.activeTabId) {
    const activeGroup = findGroupContainingTab(result.layoutRoot, result.activeTabId)
    const activeTab = activeGroup?.tabs.find((t) => t.id === result.activeTabId)
    if (activeTab?.fileId === AI_WINDOW_ID) {
      lastAiTabId = activeTab.id
    }
  }

  return {
    ...state,
    layoutRoot: result.layoutRoot,
    openFiles,
    activeGroupId: result.activeGroupId,
    activeTabId: result.activeTabId,
    lastAiTabId,
  }
}

function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    // ---- File Tree ----
    case 'SET_FILE_TREE_ROOT':
      return { ...state, fileTreeRoot: action.payload.root, fileTree: action.payload.nodes, sidebarLoading: false }
    case 'SET_CHILDREN': {
      const updateChildren = (nodes: import('../types').FileTreeNode[]): import('../types').FileTreeNode[] =>
        nodes.map((node) => {
          if (node.path === action.payload.parentPath) return { ...node, children: action.payload.children, loaded: true }
          if (node.children) return { ...node, children: updateChildren(node.children) }
          return node
        })
      return { ...state, fileTree: state.fileTree ? updateChildren(state.fileTree) : null, sidebarLoading: false }
    }
    case 'SET_SIDEBAR_LOADING':
      return { ...state, sidebarLoading: action.payload }

    // ---- Layout operations (delegated to layoutService) ----
    case 'OPEN_AI_WINDOW':
      return applyLayoutResult(state, execute(state, { type: 'OPEN_AI_WINDOW' }))
    case 'OPEN_AI_WINDOW_BELOW_FOCUS':
      return applyLayoutResult(state, execute(state, { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }))
    case 'OPEN_FILE': {
      const { tabId, groupId, ...file } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'OPEN_FILE', file, tabId, groupId }))
    }
    case 'OPEN_FILE_AND_SPLIT': {
      const { file, tabId, groupId, position } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'OPEN_AND_SPLIT', file, tabId, groupId, position }))
    }
    case 'SPLIT_GROUP': {
      const { groupId, position, tabId } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'SPLIT_GROUP', groupId, position, tabId }))
    }
    case 'SPLIT_WITH_TAB': {
      const { tabId, fromGroupId, toGroupId, position } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'SPLIT_WITH_TAB', tabId, fromGroupId, toGroupId, position }))
    }
    case 'MOVE_TAB': {
      const { tabId, fromGroupId, toGroupId, toIndex } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'MOVE_TAB', tabId, fromGroupId, toGroupId, toIndex }))
    }
    case 'CLOSE_TAB': {
      const { groupId, tabId } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'CLOSE_TAB', groupId, tabId }))
    }
    case 'CLOSE_GROUP': {
      const { groupId } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'CLOSE_GROUP', groupId }))
    }

    // ---- Simple layout operations (no validation needed) ----
    case 'SET_ACTIVE_TAB': {
      if (!state.layoutRoot) return state
      const { groupId, tabId } = action.payload
      const group = findGroup(state.layoutRoot, groupId)
      if (!group) return state
      const tabIdx = group.tabs.findIndex((t) => t.id === tabId)
      if (tabIdx < 0) return state
      const updatedGroup = { ...group, activeTabIndex: tabIdx }
      const newLayout = transformNode(state.layoutRoot, groupId, () => updatedGroup)
      const activatedTab = group.tabs[tabIdx]
      return {
        ...state,
        layoutRoot: newLayout,
        activeGroupId: groupId,
        activeTabId: tabId,
        lastAiTabId: activatedTab?.fileId === AI_WINDOW_ID ? tabId : state.lastAiTabId,
      }
    }
    case 'SET_ACTIVE_GROUP': {
      if (!state.layoutRoot) return state
      const group = findGroup(state.layoutRoot, action.payload.groupId)
      // B19c: an unknown group id must not leave a dangling activeGroupId
      if (!group) return state
      const activeTab = getActiveTab(group)
      return {
        ...state,
        activeGroupId: group.id,
        activeTabId: activeTab?.id ?? null,
        lastAiTabId: activeTab?.fileId === AI_WINDOW_ID ? activeTab.id : state.lastAiTabId,
      }
    }
    case 'TOGGLE_VIEW_MODE': {
      if (!state.layoutRoot) return state
      const tabId = action.payload.tabId
      const group = findGroupContainingTab(state.layoutRoot, tabId)
      if (!group) return state
      const updatedGroup = {
        ...group,
        tabs: group.tabs.map((t) =>
          t.id === tabId ? { ...t, viewMode: (t.viewMode === 'preview' ? 'source' : 'preview') as 'preview' | 'source' } : t
        ),
      }
      const newLayout = transformNode(state.layoutRoot, group.id, () => updatedGroup)
      return { ...state, layoutRoot: newLayout }
    }
    case 'RESIZE_SPLIT': {
      // D4: Allotment 受控化 — 拖动/关闭 pane 后的比例回写
      if (!state.layoutRoot) return state
      return { ...state, layoutRoot: resizeSplit(state.layoutRoot, action.payload.splitId, action.payload.sizes) }
    }
    default:
      return state
  }
}

// ---- UI State ----

const initialUI: UIState = {
  activeActivity: 'files',
  sidebarVisible: true,
  isDragOver: false,
  error: null,
  darkMode: localStorage.getItem('mdreader-dark-mode') === 'true',
  apiEndpoint: '',
  apiKeySaved: false,
  apiModel: '',
  pendingQuotes: [],
  aiConversations: {},
  startupConversation: null,
  conversationList: [],
}

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_ACTIVITY':
      return { ...state, activeActivity: action.payload }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible }
    case 'SET_DRAG_OVER':
      // P3: 相等性 guard —— 重复 dispatch 不再产生无效重渲染
      if (state.isDragOver === action.payload) return state
      return { ...state, isDragOver: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    case 'TOGGLE_DARK_MODE': {
      const next = !state.darkMode
      localStorage.setItem('mdreader-dark-mode', String(next))
      return { ...state, darkMode: next }
    }
    case 'SETTINGS_UPDATE':
      return { ...state, apiEndpoint: action.payload.endpoint, apiKeySaved: action.payload.hasKey, apiModel: action.payload.model }

    // ---- Pending quotes ----
    case 'ADD_QUOTE':
      return { ...state, pendingQuotes: [...state.pendingQuotes, action.payload] }
    case 'REMOVE_QUOTE':
      return { ...state, pendingQuotes: state.pendingQuotes.filter((q) => q.id !== action.payload.id) }
    case 'CLEAR_QUOTES':
      return { ...state, pendingQuotes: [] }

    // ---- AI conversations（按窗口 tabId 键控）----
    case 'SET_AI_CONVERSATION': {
      const { tabId, value } = action.payload
      if (typeof value === 'function') {
        // R1/B2: 函数式更新 — useAiStream 依赖它做原子追加与会话 id 守卫。
        // 条目不存在时 no-op —— 防流式事件在窗口关闭后复活死窗口的对话。
        const prev = state.aiConversations[tabId]
        if (!prev) return state
        return { ...state, aiConversations: { ...state.aiConversations, [tabId]: value(prev) } }
      }
      if (value === null) {
        const { [tabId]: _removed, ...rest } = state.aiConversations
        return { ...state, aiConversations: rest }
      }
      return { ...state, aiConversations: { ...state.aiConversations, [tabId]: value } }
    }
    case 'REMOVE_AI_CONVERSATION': {
      const { [action.payload.tabId]: _removed, ...rest } = state.aiConversations
      return { ...state, aiConversations: rest }
    }
    case 'REMOVE_CONVERSATION_BY_ID': {
      const aiConversations: Record<string, Conversation> = {}
      for (const [tabId, conv] of Object.entries(state.aiConversations)) {
        if (conv.id !== action.payload.convId) aiConversations[tabId] = conv
      }
      return { ...state, aiConversations }
    }
    case 'SET_STARTUP_CONVERSATION':
      return { ...state, startupConversation: action.payload.conversation }
    case 'CLAIM_STARTUP_CONVERSATION': {
      // 原子领取：双窗口同帧挂载也只能有一个拿到启动对话
      const conversation = state.startupConversation ?? createConversation()
      return {
        ...state,
        startupConversation: null,
        aiConversations: { ...state.aiConversations, [action.payload.tabId]: conversation },
      }
    }
    case 'SET_CONVERSATION_LIST':
      return { ...state, conversationList: action.payload }
    default:
      return state
  }
}

// ---- Contexts ----
//
// R2/P1: three state contexts (layout / UI / AI chat) + two stable dispatch
// contexts. The AI slice updates on every stream chunk — after this split it
// reaches only AI consumers. Dispatch-only components subscribe to the
// never-changing dispatch contexts and skip re-renders entirely.

interface LayoutContextType {
  state: LayoutState
  dispatch: React.Dispatch<LayoutAction>
}

interface UIContextType {
  state: UIStateView
  dispatch: React.Dispatch<UIAction>
}

interface AIContextType {
  state: AIChatState
  dispatch: React.Dispatch<UIAction>
}

const LayoutStateContext = createContext<LayoutState | null>(null)
const LayoutDispatchContext = createContext<React.Dispatch<LayoutAction> | null>(null)
const UIStateContext = createContext<UIStateView | null>(null)
const AIChatStateContext = createContext<AIChatState | null>(null)
const UIDispatchContext = createContext<React.Dispatch<UIAction> | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [layoutState, layoutDispatch] = useReducer(layoutReducer, initialLayout)
  const [uiState, uiDispatch] = useReducer(uiReducer, initialUI)

  // Preload API config on startup so AI Chat works without opening Settings first
  React.useEffect(() => {
    if (window.electronAPI?.loadApiConfig) {
      window.electronAPI.loadApiConfig().then((config) => {
        if (config && config.endpoint) {
          uiDispatch({ type: 'SETTINGS_UPDATE', payload: { endpoint: config.endpoint, model: config.model, hasKey: config.hasKey } })
        }
      }).catch(() => { /* no config file */ })
    }
  }, [])

  // 启动时恢复会话列表 + 最后对话（多窗口语义：首个 AI 窗口原子领取）
  React.useEffect(() => {
    if (window.electronAPI?.listConversations) {
      window.electronAPI.listConversations().then((list) => {
        uiDispatch({ type: 'SET_CONVERSATION_LIST', payload: list })
        if (list.length > 0) {
          const last = list[0]
          window.electronAPI!.loadConversation(last.id).then((data) => {
            if (data && typeof data === 'object' && 'nodes' in data && 'rootId' in data && 'id' in data) {
              // R6: 启动恢复同样走规范化，损坏数据不会破坏聊天 UI
              uiDispatch({ type: 'SET_STARTUP_CONVERSATION', payload: { conversation: normalizeConversation(data as Conversation) } })
            }
          }).catch(() => {})
        }
      }).catch(() => {})
    }
  }, [])

  // AI 窗口 GC：布局树中已不存在的 AI tab 对应的对话 → 先持久化再移除。
  // 覆盖 × 关闭 / CLOSE_GROUP 等绕过面板 handleClose 的路径（最新 state 而非渲染快照）。
  React.useEffect(() => {
    const aiTabIds = new Set(
      layoutState.layoutRoot
        ? collectAllTabs(layoutState.layoutRoot).filter((t) => t.fileId === AI_WINDOW_ID).map((t) => t.id)
        : []
    )
    for (const [tabId, conv] of Object.entries(uiState.aiConversations)) {
      if (!aiTabIds.has(tabId)) {
        persistConversation(conv)
        uiDispatch({ type: 'REMOVE_AI_CONVERSATION', payload: { tabId } })
      }
    }
  }, [layoutState.layoutRoot, uiState.aiConversations])

  // P1: memoized slice values — chat chunks must not rebuild the other contexts
  const uiStateValue = React.useMemo<UIStateView>(() => ({
    activeActivity: uiState.activeActivity,
    sidebarVisible: uiState.sidebarVisible,
    isDragOver: uiState.isDragOver,
    error: uiState.error,
    darkMode: uiState.darkMode,
    apiEndpoint: uiState.apiEndpoint,
    apiKeySaved: uiState.apiKeySaved,
    apiModel: uiState.apiModel,
  }), [
    uiState.activeActivity, uiState.sidebarVisible, uiState.isDragOver, uiState.error,
    uiState.darkMode, uiState.apiEndpoint, uiState.apiKeySaved, uiState.apiModel,
  ])

  const aiStateValue = React.useMemo<AIChatState>(() => ({
    pendingQuotes: uiState.pendingQuotes,
    aiConversations: uiState.aiConversations,
    startupConversation: uiState.startupConversation,
    conversationList: uiState.conversationList,
  }), [uiState.pendingQuotes, uiState.aiConversations, uiState.startupConversation, uiState.conversationList])

  return (
    <LayoutStateContext.Provider value={layoutState}>
      <LayoutDispatchContext.Provider value={layoutDispatch}>
        <UIStateContext.Provider value={uiStateValue}>
          <AIChatStateContext.Provider value={aiStateValue}>
            <UIDispatchContext.Provider value={uiDispatch}>
              {children}
            </UIDispatchContext.Provider>
          </AIChatStateContext.Provider>
        </UIStateContext.Provider>
      </LayoutDispatchContext.Provider>
    </LayoutStateContext.Provider>
  )
}

export function useLayoutContext(): LayoutContextType {
  const state = useContext(LayoutStateContext)
  const dispatch = useContext(LayoutDispatchContext)
  if (!state || !dispatch) throw new Error('useLayoutContext must be used within AppProvider')
  return { state, dispatch }
}

export function useUIContext(): UIContextType {
  const state = useContext(UIStateContext)
  const dispatch = useContext(UIDispatchContext)
  if (!state || !dispatch) throw new Error('useUIContext must be used within AppProvider')
  return { state, dispatch }
}

export function useAIContext(): AIContextType {
  const state = useContext(AIChatStateContext)
  const dispatch = useContext(UIDispatchContext)
  if (!state || !dispatch) throw new Error('useAIContext must be used within AppProvider')
  return { state, dispatch }
}

// Dispatch-only hooks — subscribe to the stable dispatch contexts, never re-render
export function useLayoutDispatch(): React.Dispatch<LayoutAction> {
  const dispatch = useContext(LayoutDispatchContext)
  if (!dispatch) throw new Error('useLayoutDispatch must be used within AppProvider')
  return dispatch
}

export function useUIDispatch(): React.Dispatch<UIAction> {
  const dispatch = useContext(UIDispatchContext)
  if (!dispatch) throw new Error('useUIDispatch must be used within AppProvider')
  return dispatch
}
