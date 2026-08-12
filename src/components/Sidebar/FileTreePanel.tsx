import { useState, useCallback, useRef, memo } from 'react'
import { useLayoutContext, useUIDispatch } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'
import { openFileByPath, generateTabId } from '../../utils/fileReader'
import type { FileTreeNode, FileDirEntry } from '../../types'

interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  isExpanded: boolean
  onToggle: (node: FileTreeNode) => void
  onOpen: (path: string) => void
}

// D8: memoized tree node — sibling subtrees skip re-rendering when another
// directory loads children (node references are preserved by SET_CHILDREN).
const TreeNode = memo(function TreeNode({ node, depth, isExpanded, onToggle, onOpen }: TreeNodeProps) {
  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-sm"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        draggable={node.isFile}
        onDragStart={(e) => {
          if (node.isFile) {
            e.dataTransfer.setData('text/file-path', node.path)
            e.dataTransfer.setData('text/file-name', node.name)
            e.dataTransfer.effectAllowed = 'copy'
          }
        }}
        onClick={() => {
          if (node.isDirectory) {
            onToggle(node)
          } else {
            onOpen(node.path)
          }
        }}
      >
        {/* Expand/collapse arrow for directories */}
        {node.isDirectory && (
          <span className="w-4 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {node.isFile && <span className="w-4 flex-shrink-0" />}

        {/* Icon */}
        <span className="text-sm flex-shrink-0">
          {node.isDirectory
            ? isExpanded ? '📂' : '📁'
            : '📄'
          }
        </span>

        {/* Name */}
        <span className="truncate text-gray-700 dark:text-gray-300">
          {node.name}
        </span>
      </div>

      {/* Render children if expanded */}
      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              isExpanded={expandedChildren.has(child.path)}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// The expanded set is threaded through renders via a module-scope live ref so
// TreeNode receives plain props and memoization stays effective. React state
// (expandedDirs) remains the source of truth for the panel itself.
const expandedChildren = new Set<string>()

export function FileTreePanel() {
  const { state: layoutState, dispatch: layoutDispatch } = useLayoutContext()
  const uiDispatch = useUIDispatch()
  const { openFolderDialog, openFileDialog, readDir, readFile } = useElectronAPI()
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const expandedRef = useRef(expandedDirs)
  expandedRef.current = expandedDirs
  // keep the module-scope set in sync for the memoized nodes
  expandedChildren.clear()
  for (const p of expandedDirs) expandedChildren.add(p)

  const handleOpenFolder = useCallback(async () => {
    try {
      const folderPath = await openFolderDialog()
      if (!folderPath) return

      layoutDispatch({ type: 'SET_SIDEBAR_LOADING', payload: true })

      const entries = await readDir(folderPath)
      const nodes: FileTreeNode[] = entries.map((entry: FileDirEntry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDirectory,
        isFile: entry.isFile,
        extension: entry.extension,
        children: undefined,
        loaded: false,
      }))

      layoutDispatch({
        type: 'SET_FILE_TREE_ROOT',
        payload: { root: folderPath, nodes },
      })

      setExpandedDirs(new Set())
    } catch {
      layoutDispatch({ type: 'SET_SIDEBAR_LOADING', payload: false })
      uiDispatch({ type: 'SET_ERROR', payload: 'Failed to open folder.' })
    }
  }, [openFolderDialog, readDir, layoutDispatch, uiDispatch])

  const handleToggleDir = useCallback(async (node: FileTreeNode) => {
    if (!node.isDirectory) return
    // read from the ref so this callback stays identity-stable for TreeNode memo
    const isExpanding = !expandedRef.current.has(node.path)

    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(node.path)) {
        next.delete(node.path)
      } else {
        next.add(node.path)
      }
      return next
    })

    // Load children if not loaded yet
    if (isExpanding && !node.loaded) {
      layoutDispatch({ type: 'SET_SIDEBAR_LOADING', payload: true })
      try {
        const entries = await readDir(node.path)
        const children: FileTreeNode[] = entries.map((entry: FileDirEntry) => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory,
          isFile: entry.isFile,
          extension: entry.extension,
          children: undefined,
          loaded: false,
        }))
        layoutDispatch({ type: 'SET_CHILDREN', payload: { parentPath: node.path, children } })
      } catch {
        layoutDispatch({ type: 'SET_SIDEBAR_LOADING', payload: false })
        uiDispatch({ type: 'SET_ERROR', payload: `Failed to read directory: ${node.name}` })
      }
    }
  }, [readDir, layoutDispatch, uiDispatch])

  const handleOpenFile = useCallback(async (filePath: string) => {
    try {
      // E6: shared path→OpenFile flow
      const openFile = await openFileByPath(filePath, readFile)
      layoutDispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: generateTabId() } })
    } catch {
      uiDispatch({ type: 'SET_ERROR', payload: `Failed to open file: ${filePath}` })
    }
  }, [readFile, layoutDispatch, uiDispatch])

  const handleOpenFileDialog = useCallback(async () => {
    try {
      const filePath = await openFileDialog()
      if (!filePath) return
      await handleOpenFile(filePath)
    } catch {
      uiDispatch({ type: 'SET_ERROR', payload: 'Failed to open file.' })
    }
  }, [openFileDialog, handleOpenFile, uiDispatch])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-300 dark:border-gray-700">
        <button
          onClick={handleOpenFolder}
          className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
          title="Open Folder"
        >
          📂 Open Folder
        </button>
        <button
          onClick={handleOpenFileDialog}
          className="px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
          title="Open File"
        >
          📄
        </button>
      </div>

      {/* File Tree or Empty State */}
      <div className="flex-1 overflow-y-auto py-1">
        {layoutState.sidebarLoading && (
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">Loading...</div>
        )}
        {!layoutState.fileTree && !layoutState.sidebarLoading && (
          <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            Open a folder to browse markdown files
          </div>
        )}
        {layoutState.fileTree && layoutState.fileTree.length === 0 && !layoutState.sidebarLoading && (
          <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            No markdown files found in this folder
          </div>
        )}
        {layoutState.fileTree && layoutState.fileTree.length > 0 && (
          <div>
            {layoutState.fileTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                isExpanded={expandedDirs.has(node.path)}
                onToggle={handleToggleDir}
                onOpen={handleOpenFile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Root path */}
      {layoutState.fileTreeRoot && (
        <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-sidebar-border truncate">
          {layoutState.fileTreeRoot}
        </div>
      )}
    </div>
  )
}
