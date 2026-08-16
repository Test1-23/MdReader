// ---- File System Types ----
import type { Conversation } from '../utils/conversationTree'

export interface FileDirEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  extension: string
}

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  extension: string
  children?: FileTreeNode[]
  loaded: boolean
}

// ---- Heading Types ----

export interface Heading {
  level: number // 1-6
  text: string
  line: number // line number in source
}

// ---- Open File Types ----

export interface OpenFile {
  fileId: string
  filePath: string // absolute path on disk, empty for pasted content
  fileName: string
  content: string
  fileSize: number
  lastModified: number
  headings: Heading[]
}

// ---- Tab & Editor Group Types ----

export type ViewMode = 'preview' | 'source'

export interface TabEntry {
  id: string
  fileId: string
  filePath: string
  fileName: string
  viewMode: ViewMode
}

export interface EditorGroup {
  type: 'group'
  id: string
  tabs: TabEntry[]
  activeTabIndex: number
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: LayoutNode[]
  sizes: number[] // percentage sizes (0-100)
}

export type LayoutNode = EditorGroup | SplitNode

export type SplitPosition = 'left' | 'right' | 'top' | 'bottom'

// ---- App State ----

export type ActivityType = 'files' | 'outline' | 'settings'

/** 低频布局状态 — 变更时只重渲染布局树消费者 */
export interface LayoutState {
  // File system (sidebar)
  fileTreeRoot: string | null
  fileTree: FileTreeNode[] | null
  sidebarLoading: boolean

  // Editor Groups (main area)
  layoutRoot: LayoutNode | null
  activeGroupId: string | null
  activeTabId: string | null
  // 最近聚焦过的 AI 窗口 tab —— 划选引用打开时优先聚焦它
  lastAiTabId: string | null
  // 用户最后工作的非 AI 组 —— 💬 新建 AI 窗口时的锚点（防止堆叠在 AI 窗口下方）
  lastFileGroupId: string | null

  // Open files (keyed by fileId)
  openFiles: Record<string, OpenFile>
}

/** 高频 UI 状态 — 变更时只重渲染 UI 消费者 */
export interface UIState {
  // Activity Bar
  activeActivity: ActivityType

  // UI state
  sidebarVisible: boolean
  isDragOver: boolean
  error: string | null
  darkMode: boolean

  // Settings（S1: apiKey 永不出主进程，渲染层只知"是否有已保存的 key"）
  apiEndpoint: string
  apiKeySaved: boolean
  apiModel: string

  // AI Chat（多窗口独立对话）
  pendingQuotes: PendingQuote[]
  aiConversations: Record<string, Conversation> // 按 AI tabId 键控
  startupConversation: Conversation | null // 启动恢复，首窗原子领取
  conversationList: Array<{ id: string; title: string; updatedAt: number }>
}

/** 待发送的引用内容（划选后点击 📎 引用累计） */
export interface PendingQuote {
  id: string
  text: string
}

// R2: AI 状态切片 — 独立 Context，聊天每 token 更新不再触达布局/UI 消费者
export interface AIChatState {
  pendingQuotes: PendingQuote[]
  aiConversations: Record<string, Conversation>
  startupConversation: Conversation | null
  conversationList: Array<{ id: string; title: string; updatedAt: number }>
}

export type UIStateView = Omit<UIState, 'pendingQuotes' | 'aiConversations' | 'startupConversation' | 'conversationList'>

// ---- App Actions ----

export type LayoutAction =
  // File tree
  | { type: 'SET_FILE_TREE_ROOT'; payload: { root: string; nodes: FileTreeNode[] } }
  | { type: 'SET_CHILDREN'; payload: { parentPath: string; children: FileTreeNode[] } }
  | { type: 'SET_SIDEBAR_LOADING'; payload: boolean }

  // File operations
  | { type: 'OPEN_FILE'; payload: OpenFile & { tabId: string; groupId?: string } }
  | { type: 'CLOSE_TAB'; payload: { groupId: string; tabId: string } }
  | { type: 'SET_ACTIVE_TAB'; payload: { groupId: string; tabId: string } }

  // Editor group operations
  | { type: 'OPEN_AI_WINDOW' }
  | { type: 'OPEN_AI_WINDOW_BELOW_FOCUS' }
  | { type: 'SPLIT_GROUP'; payload: { groupId: string; position: SplitPosition; tabId?: string } }
  | { type: 'OPEN_FILE_AND_SPLIT'; payload: { file: OpenFile; tabId: string; groupId: string; position: SplitPosition } }
  | { type: 'SPLIT_WITH_TAB'; payload: { tabId: string; fromGroupId: string; toGroupId: string; position: SplitPosition } }
  | { type: 'CLOSE_GROUP'; payload: { groupId: string } }
  | { type: 'MOVE_TAB'; payload: { tabId: string; fromGroupId: string; toGroupId: string; toIndex: number } }
  | { type: 'SET_ACTIVE_GROUP'; payload: { groupId: string } }
  | { type: 'RESIZE_SPLIT'; payload: { splitId: string; sizes: number[] } }

  // View
  | { type: 'TOGGLE_VIEW_MODE'; payload: { tabId: string } }

export type UIAction =
  // Activity bar
  | { type: 'SET_ACTIVITY'; payload: ActivityType }
  | { type: 'TOGGLE_SIDEBAR' }

  // UI
  | { type: 'SET_DRAG_OVER'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TOGGLE_DARK_MODE' }
  | { type: 'SETTINGS_UPDATE'; payload: { endpoint: string; model: string; hasKey: boolean } }

  // Pending quotes（多引用）
  | { type: 'ADD_QUOTE'; payload: PendingQuote }
  | { type: 'REMOVE_QUOTE'; payload: { id: string } }
  | { type: 'CLEAR_QUOTES' }

  // AI conversations（按窗口 tabId 键控）
  // 函数式更新对不存在的 tabId 直接 no-op —— 防流式结束后复活已关闭窗口的对话
  | { type: 'SET_AI_CONVERSATION'; payload: { tabId: string; value: Conversation | ((prev: Conversation) => Conversation) | null } }
  | { type: 'REMOVE_AI_CONVERSATION'; payload: { tabId: string } }
  | { type: 'REMOVE_CONVERSATION_BY_ID'; payload: { convId: string } }
  | { type: 'SET_STARTUP_CONVERSATION'; payload: { conversation: Conversation } }
  | { type: 'CLAIM_STARTUP_CONVERSATION'; payload: { tabId: string } }
  | { type: 'SET_CONVERSATION_LIST'; payload: Array<{ id: string; title: string; updatedAt: number }> }

// ---- Layout Helper ----

export function isEditorGroup(node: LayoutNode): node is EditorGroup {
  return node.type === 'group'
}

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split'
}
