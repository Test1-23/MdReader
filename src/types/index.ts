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

export type ActivityType = 'files' | 'outline'

export interface AppState {
  // Activity Bar
  activeActivity: ActivityType

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

  // UI state
  sidebarVisible: boolean
  isDragOver: boolean
  error: string | null
}

// ---- App Actions ----

export type AppAction =
  // Activity bar
  | { type: 'SET_ACTIVITY'; payload: ActivityType }
  | { type: 'TOGGLE_SIDEBAR' }

  // File tree
  | { type: 'SET_FILE_TREE_ROOT'; payload: { root: string; nodes: FileTreeNode[] } }
  | { type: 'SET_CHILDREN'; payload: { parentPath: string; children: FileTreeNode[] } }
  | { type: 'SET_SIDEBAR_LOADING'; payload: boolean }

  // File operations
  | { type: 'OPEN_FILE'; payload: OpenFile & { tabId: string; groupId?: string } }
  | { type: 'CLOSE_TAB'; payload: { groupId: string; tabId: string } }
  | { type: 'SET_ACTIVE_TAB'; payload: { groupId: string; tabId: string } }

  // Editor group operations
  | { type: 'SPLIT_GROUP'; payload: { groupId: string; position: SplitPosition; tabId?: string } }
  | { type: 'OPEN_FILE_AND_SPLIT'; payload: { file: OpenFile; tabId: string; groupId: string; position: SplitPosition } }
  | { type: 'SPLIT_WITH_TAB'; payload: { tabId: string; fromGroupId: string; toGroupId: string; position: SplitPosition } }
  | { type: 'CLOSE_GROUP'; payload: { groupId: string } }
  | { type: 'MOVE_TAB'; payload: { tabId: string; fromGroupId: string; toGroupId: string; toIndex: number } }
  | { type: 'RESIZE_SPLIT'; payload: { splitId: string; sizes: number[] } }
  | { type: 'SET_ACTIVE_GROUP'; payload: { groupId: string } }

  // View
  | { type: 'TOGGLE_VIEW_MODE'; payload: { tabId: string } }

  // UI
  | { type: 'SET_DRAG_OVER'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }

// ---- Layout Helper ----

export function isEditorGroup(node: LayoutNode): node is EditorGroup {
  return node.type === 'group'
}

export function isSplitNode(node: LayoutNode): node is SplitNode {
  return node.type === 'split'
}
