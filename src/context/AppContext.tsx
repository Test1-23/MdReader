import React, { createContext, useContext, useReducer } from 'react'
import type { AppState, AppAction } from '../types'
import { isEditorGroup, isSplitNode } from '../types'
import {
  findGroup,
  findGroupContainingTab,
  transformNode,
  resizeSplit,
  getFirstGroup,
  getActiveTab,
} from '../utils/layout'
import { execute } from '../services/layoutService'
import type { LayoutResult } from '../services/layoutService'

// ---- Initial State ----

const initialState: AppState = {
  activeActivity: 'files',
  fileTreeRoot: null,
  fileTree: null,
  sidebarLoading: false,
  layoutRoot: null,
  activeGroupId: null,
  activeTabId: null,
  openFiles: {},
  sidebarVisible: true,
  isDragOver: false,
  error: null,
}

// ---- Apply layoutService result to state ----

function applyLayoutResult(state: AppState, result: LayoutResult): AppState {
  let openFiles = { ...state.openFiles }
  if (result.openFilesToAdd) {
    openFiles = { ...openFiles, ...result.openFilesToAdd }
  }
  if (result.openFilesToRemove) {
    for (const id of result.openFilesToRemove) {
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

// ---- Reducer ----

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // ---- Activity Bar ----
    case 'SET_ACTIVITY':
      return { ...state, activeActivity: action.payload }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible }

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
    case 'OPEN_FILE': {
      const { tabId, groupId, ...file } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'OPEN_FILE', file, tabId, groupId }))
    }
    case 'OPEN_FILE_AND_SPLIT': {
      const { file, tabId, groupId, direction } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'OPEN_AND_SPLIT', file, tabId, groupId, direction }))
    }
    case 'SPLIT_GROUP': {
      const { groupId, direction, tabId } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'SPLIT_GROUP', groupId, direction, tabId }))
    }
    case 'SPLIT_WITH_TAB': {
      const { tabId, fromGroupId, toGroupId, direction } = action.payload
      return applyLayoutResult(state, execute(state, { type: 'SPLIT_WITH_TAB', tabId, fromGroupId, toGroupId, direction }))
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
      const activeTab = group ? getActiveTab(group) : null
      return { ...state, activeGroupId: action.payload.groupId, activeTabId: activeTab?.id ?? null }
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
      if (!state.layoutRoot) return state
      const newLayout = resizeSplit(state.layoutRoot, action.payload.splitId, action.payload.sizes)
      return { ...state, layoutRoot: newLayout }
    }

    // ---- UI ----
    case 'SET_DRAG_OVER':
      return { ...state, isDragOver: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    default:
      return state
  }
}

// ---- Context ----

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
