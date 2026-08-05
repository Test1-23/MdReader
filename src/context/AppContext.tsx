import React, { createContext, useContext, useReducer } from 'react'
import type { AppState, AppAction, OpenFile, TabEntry, LayoutNode, EditorGroup, SplitNode } from '../types'
import { isEditorGroup } from '../types'
import {
  createDefaultLayout,
  addTabToGroup,
  removeTabFromGroup,
  splitGroup,
  moveTab,
  closeGroup,
  resizeSplit,
  getFirstGroup,
  getActiveTab,
  findGroup,
  findGroupContainingTab,
  transformNode,
} from '../utils/layout'

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

// ---- Helpers ----

function collectAllTabs(node: LayoutNode): TabEntry[] {
  if (isEditorGroup(node)) return [...node.tabs]
  const split = node as SplitNode
  return split.children.flatMap(collectAllTabs)
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
      return {
        ...state,
        fileTreeRoot: action.payload.root,
        fileTree: action.payload.nodes,
        sidebarLoading: false,
      }

    case 'SET_CHILDREN': {
      const updateChildren = (nodes: import('../types').FileTreeNode[]): import('../types').FileTreeNode[] =>
        nodes.map((node) => {
          if (node.path === action.payload.parentPath) {
            return { ...node, children: action.payload.children, loaded: true }
          }
          if (node.children) {
            return { ...node, children: updateChildren(node.children) }
          }
          return node
        })
      return {
        ...state,
        fileTree: state.fileTree ? updateChildren(state.fileTree) : null,
        sidebarLoading: false,
      }
    }

    case 'SET_SIDEBAR_LOADING':
      return { ...state, sidebarLoading: action.payload }

    // ---- File Operations ----
    case 'OPEN_FILE': {
      const { tabId, ...file } = action.payload
      const newOpenFiles = { ...state.openFiles, [file.fileId]: file }

      const tab: TabEntry = {
        id: tabId,
        fileId: file.fileId,
        filePath: file.filePath,
        fileName: file.fileName,
        viewMode: 'preview',
      }

      let layout = state.layoutRoot
      if (!layout) {
        layout = createDefaultLayout()
      }

      // Add tab to the active group or the first group
      let targetGroupId = state.activeGroupId || getFirstGroup(layout)?.id || ''
      let newLayout = layout

      const group = findGroup(newLayout, targetGroupId)
      if (group) {
        const updatedGroup = addTabToGroup(group, tab)
        newLayout = transformNode(newLayout, targetGroupId, () => updatedGroup)
      } else {
        const firstGroup = getFirstGroup(newLayout)
        if (firstGroup) {
          const updatedGroup = addTabToGroup(firstGroup, tab)
          newLayout = transformNode(newLayout, firstGroup.id, () => updatedGroup)
          targetGroupId = firstGroup.id
        }
      }

      return {
        ...state,
        layoutRoot: newLayout,
        openFiles: newOpenFiles,
        activeGroupId: targetGroupId,
        activeTabId: tab.id,
      }
    }

    case 'CLOSE_TAB': {
      if (!state.layoutRoot) return state
      const { groupId, tabId } = action.payload

      const group = findGroup(state.layoutRoot, groupId)
      if (!group) return state

      const tabToClose = group.tabs.find((t) => t.id === tabId)
      const result = removeTabFromGroup(group, tabId)

      let newLayout = state.layoutRoot
      let newActiveGroupId = state.activeGroupId
      let newActiveTabId = state.activeTabId

      if (!result) {
        newLayout = closeGroup(state.layoutRoot, groupId)
        const newFirstGroup = getFirstGroup(newLayout)
        newActiveGroupId = newFirstGroup?.id ?? null
        newActiveTabId = newFirstGroup && newFirstGroup.tabs.length > 0
          ? newFirstGroup.tabs[newFirstGroup.activeTabIndex >= 0 ? newFirstGroup.activeTabIndex : 0]?.id ?? null
          : null
      } else {
        newLayout = transformNode(state.layoutRoot, groupId, () => result)
        newActiveTabId = getActiveTab(result)?.id ?? null
      }

      // Clean up openFiles if no other tab references this file
      let newOpenFiles = { ...state.openFiles }
      if (tabToClose) {
        const allTabs = collectAllTabs(newLayout)
        const fileStillOpen = allTabs.some((t) => t.fileId === tabToClose.fileId && t.id !== tabId)
        if (!fileStillOpen) {
          const { [tabToClose.fileId]: _, ...rest } = newOpenFiles
          newOpenFiles = rest
        }
      }

      // If no tabs left at all, go back to empty state
      const allTabs = collectAllTabs(newLayout)
      if (allTabs.length === 0) {
        return {
          ...state,
          layoutRoot: null,
          openFiles: {},
          activeGroupId: null,
          activeTabId: null,
        }
      }

      return {
        ...state,
        layoutRoot: newLayout,
        openFiles: newOpenFiles,
        activeGroupId: newActiveGroupId,
        activeTabId: newActiveTabId,
      }
    }

    case 'SET_ACTIVE_TAB': {
      const { groupId, tabId } = action.payload
      if (!state.layoutRoot) return state
      const group = findGroup(state.layoutRoot, groupId)
      if (!group) return state
      const tabIdx = group.tabs.findIndex((t) => t.id === tabId)
      if (tabIdx < 0) return state
      const updatedGroup = { ...group, activeTabIndex: tabIdx }
      const newLayout = transformNode(state.layoutRoot, groupId, () => updatedGroup)
      return {
        ...state,
        layoutRoot: newLayout,
        activeGroupId: groupId,
        activeTabId: tabId,
      }
    }

    // ---- Editor Group Operations ----
    case 'SPLIT_GROUP': {
      if (!state.layoutRoot) return state
      const newLayout = splitGroup(state.layoutRoot, action.payload.groupId, action.payload.direction)
      return { ...state, layoutRoot: newLayout }
    }

    case 'CLOSE_GROUP': {
      if (!state.layoutRoot) return state
      const newLayout = closeGroup(state.layoutRoot, action.payload.groupId)
      const newFirstGroup = getFirstGroup(newLayout)
      return {
        ...state,
        layoutRoot: newLayout,
        activeGroupId: newFirstGroup?.id ?? null,
        activeTabId: newFirstGroup && newFirstGroup.tabs.length > 0
          ? (newFirstGroup.tabs[newFirstGroup.activeTabIndex >= 0 ? newFirstGroup.activeTabIndex : 0]?.id ?? null)
          : null,
      }
    }

    case 'MOVE_TAB': {
      if (!state.layoutRoot) return state
      const newLayout = moveTab(
        state.layoutRoot,
        action.payload.tabId,
        action.payload.fromGroupId,
        action.payload.toGroupId,
        action.payload.toIndex
      )
      return {
        ...state,
        layoutRoot: newLayout,
        activeGroupId: action.payload.toGroupId,
        activeTabId: action.payload.tabId,
      }
    }

    case 'RESIZE_SPLIT': {
      if (!state.layoutRoot) return state
      const newLayout = resizeSplit(state.layoutRoot, action.payload.splitId, action.payload.sizes)
      return { ...state, layoutRoot: newLayout }
    }

    case 'SET_ACTIVE_GROUP': {
      if (!state.layoutRoot) return state
      const groupId = action.payload.groupId
      const group = findGroup(state.layoutRoot, groupId)
      const activeTab = group ? getActiveTab(group) : null
      return {
        ...state,
        activeGroupId: groupId,
        activeTabId: activeTab?.id ?? null,
      }
    }

    // ---- View ----
    case 'TOGGLE_VIEW_MODE': {
      if (!state.layoutRoot) return state
      const tabId = action.payload.tabId
      const group = findGroupContainingTab(state.layoutRoot, tabId)
      if (!group) return state

      const updatedGroup: EditorGroup = {
        ...group,
        tabs: group.tabs.map((t) =>
          t.id === tabId
            ? { ...t, viewMode: (t.viewMode === 'preview' ? 'source' : 'preview') as 'preview' | 'source' }
            : t
        ),
      }

      const newLayout = transformNode(state.layoutRoot, group.id, () => updatedGroup)
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
  if (!ctx) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return ctx
}
