import React, { createContext, useContext, useReducer } from 'react'
import type { LayoutState, LayoutAction, UIState, UIAction } from '../types'
import { isEditorGroup, isSplitNode } from '../types'
import {
  findGroup,
  findGroupContainingTab,
  transformNode,
  getFirstGroup,
  getActiveTab,
  resizeSplit,
} from '../utils/layout'
import { execute } from '../services/layoutService'
import type { LayoutResult } from '../services/layoutService'
import { createConversation, normalizeConversation } from '../utils/conversationTree'
import type { Conversation } from '../utils/conversationTree'

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
  return {
    ...state,
    layoutRoot: result.layoutRoot,
    openFiles,
    activeGroupId: result.activeGroupId,
    activeTabId: result.activeTabId,
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
      return { ...state, layoutRoot: newLayout, activeGroupId: groupId, activeTabId: tabId }
    }
    case 'SET_ACTIVE_GROUP': {
      if (!state.layoutRoot) return state
      const group = findGroup(state.layoutRoot, action.payload.groupId)
      // B19c: an unknown group id must not leave a dangling activeGroupId
      if (!group) return state
      const activeTab = getActiveTab(group)
      return { ...state, activeGroupId: group.id, activeTabId: activeTab?.id ?? null }
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
  selectedText: null,
  aiConversation: null,
  conversationList: [],
}

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case 'SET_ACTIVITY':
      return { ...state, activeActivity: action.payload }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible }
    case 'SET_DRAG_OVER':
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
    case 'SET_SELECTION': {
      // 相等性 guard：相同文本不产生新 state（防止文档内每次点击全量重渲染）
      if (state.selectedText === action.payload.text) return state
      return { ...state, selectedText: action.payload.text }
    }
    case 'SET_AI_CONVERSATION': {
      const payload = action.payload
      if (typeof payload === 'function') {
        // R1/B2: 函数式更新 — useAiStream 依赖它做原子追加与会话 id 守卫
        const prev = state.aiConversation ?? createConversation()
        return { ...state, aiConversation: payload(prev) }
      }
      return { ...state, aiConversation: payload }
    }
    case 'SET_CONVERSATION_LIST':
      return { ...state, conversationList: action.payload }
    default:
      return state
  }
}

// ---- Contexts ----

interface LayoutContextType {
  state: LayoutState
  dispatch: React.Dispatch<LayoutAction>
}

interface UIContextType {
  state: UIState
  dispatch: React.Dispatch<UIAction>
}

const LayoutContext = createContext<LayoutContextType | null>(null)
const UIContext = createContext<UIContextType | null>(null)

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

  // Fix 4: 启动时自动恢复上次对话（按 updatedAt 降序取第一条）
  React.useEffect(() => {
    if (window.electronAPI?.listConversations) {
      window.electronAPI.listConversations().then((list) => {
        if (list.length > 0) {
          const last = list[0]
          window.electronAPI!.loadConversation(last.id).then((data) => {
            if (data && typeof data === 'object' && 'nodes' in data && 'rootId' in data && 'id' in data) {
              // R6: 启动恢复同样走规范化，损坏数据不会破坏聊天 UI
              uiDispatch({ type: 'SET_AI_CONVERSATION', payload: normalizeConversation(data as Conversation) })
              uiDispatch({ type: 'SET_CONVERSATION_LIST', payload: list })
            }
          }).catch(() => {})
        }
      }).catch(() => {})
    }
  }, [])

  return (
    <LayoutContext.Provider value={{ state: layoutState, dispatch: layoutDispatch }}>
      <UIContext.Provider value={{ state: uiState, dispatch: uiDispatch }}>
        {children}
      </UIContext.Provider>
    </LayoutContext.Provider>
  )
}

export function useLayoutContext(): LayoutContextType {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayoutContext must be used within AppProvider')
  return ctx
}

export function useUIContext(): UIContextType {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUIContext must be used within AppProvider')
  return ctx
}
