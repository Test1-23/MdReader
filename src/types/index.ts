// ---- File System Types ----

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

  // Settings
  apiEndpoint: string
  apiKey: string
  apiModel: string

  // AI Chat
  selectedText: string | null
  aiConversation: import('../utils/conversationTree').Conversation | null
  conversationList: Array<{ id: string; title: string; updatedAt: number }>
}

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
  | { type: 'SPLIT_GROUP'; payload: { groupId: string; position: SplitPosition; tabId?: string } }
  | { type: 'OPEN_FILE_AND_SPLIT'; payload: { file: OpenFile; tabId: string; groupId: string; position: SplitPosition } }
  | { type: 'SPLIT_WITH_TAB'; payload: { tabId: string; fromGroupId: string; toGroupId: string; position: SplitPosition } }
  | { type: 'CLOSE_GROUP'; payload: { groupId: string } }
  | { type: 'MOVE_TAB'; payload: { tabId: string; fromGroupId: string; toGroupId: string; toIndex: number } }
  | { type: 'SET_ACTIVE_GROUP'; payload: { groupId: string } }

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
  | { type: 'SETTINGS_UPDATE'; payload: { endpoint: string; apiKey: string; model: string } }
  | { type: 'SET_SELECTION'; payload: { text: string | null } }
  | { type: 'SET_AI_CONVERSATION'; payload: import('../utils/conversationTree').Conversation | null }
  | { type: 'SET_CONVERSATION_LIST'; payload: Array<{ id: string; title: string; updatedAt: number }> }

// ---- Layout Helper ----

export function isEditorGroup(node: LayoutNode): node is EditorGroup {
  return node.type === 'group'
}

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split'
}
