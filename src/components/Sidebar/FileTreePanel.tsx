import { useState, useCallback } from 'react'
import { useAppContext } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'
import { generateFileId, getFileName, extractHeadings } from '../../utils/markdown'
import type { FileTreeNode, OpenFile, FileDirEntry } from '../../types'

export function FileTreePanel() {
  const { state, dispatch } = useAppContext()
  const { openFolderDialog, openFileDialog, readDir, readFile } = useElectronAPI()
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const handleOpenFolder = useCallback(async () => {
    try {
      const folderPath = await openFolderDialog()
      if (!folderPath) return

      dispatch({ type: 'SET_SIDEBAR_LOADING', payload: true })

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

      dispatch({
        type: 'SET_FILE_TREE_ROOT',
        payload: { root: folderPath, nodes },
      })

      setExpandedDirs(new Set())
    } catch (err) {
      dispatch({ type: 'SET_SIDEBAR_LOADING', payload: false })
      dispatch({ type: 'SET_ERROR', payload: 'Failed to open folder.' })
    }
  }, [openFolderDialog, readDir, dispatch])

  const handleToggleDir = useCallback(async (node: FileTreeNode) => {
    if (!node.isDirectory) return

    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(node.path)) {
      newExpanded.delete(node.path)
      setExpandedDirs(newExpanded)
    } else {
      newExpanded.add(node.path)
      setExpandedDirs(newExpanded)

      // Load children if not loaded yet
      if (!node.loaded) {
        dispatch({ type: 'SET_SIDEBAR_LOADING', payload: true })
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
          dispatch({ type: 'SET_CHILDREN', payload: { parentPath: node.path, children } })
        } catch {
          dispatch({ type: 'SET_SIDEBAR_LOADING', payload: false })
          dispatch({ type: 'SET_ERROR', payload: `Failed to read directory: ${node.name}` })
        }
      }
    }
  }, [expandedDirs, readDir, dispatch])

  const handleOpenFile = useCallback(async (filePath: string) => {
    try {
      const result = await readFile(filePath)
      const fileName = getFileName(filePath)
      const fileId = generateFileId(filePath)
      const headings = extractHeadings(result.content)

      const openFile: OpenFile = {
        fileId,
        filePath,
        fileName,
        content: result.content,
        fileSize: result.size,
        lastModified: result.lastModified,
        headings,
      }

      dispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } })
    } catch {
      dispatch({ type: 'SET_ERROR', payload: `Failed to open file: ${filePath}` })
    }
  }, [readFile, dispatch])

  const handleOpenFileDialog = useCallback(async () => {
    try {
      const filePath = await openFileDialog()
      if (!filePath) return
      await handleOpenFile(filePath)
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to open file.' })
    }
  }, [openFileDialog, handleOpenFile, dispatch])

  const renderTree = (nodes: FileTreeNode[], depth: number = 0): JSX.Element => {
    return (
      <div>
        {nodes.map((node) => (
          <div key={node.path}>
            <div
              className={`
                flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-sm
                ${depth > 0 ? 'pl-' + (depth * 16 + 8) : 'pl-2'}
              `}
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
                  handleToggleDir(node)
                } else {
                  handleOpenFile(node.path)
                }
              }}
            >
              {/* Expand/collapse arrow for directories */}
              {node.isDirectory && (
                <span className="w-4 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {expandedDirs.has(node.path) ? '▼' : '▶'}
                </span>
              )}
              {node.isFile && <span className="w-4 flex-shrink-0" />}

              {/* Icon */}
              <span className="text-sm flex-shrink-0">
                {node.isDirectory
                  ? expandedDirs.has(node.path) ? '📂' : '📁'
                  : '📄'
                }
              </span>

              {/* Name */}
              <span className="truncate text-gray-700 dark:text-gray-300">
                {node.name}
              </span>
            </div>

            {/* Render children if expanded */}
            {node.isDirectory && expandedDirs.has(node.path) && node.children && (
              renderTree(node.children, depth + 1)
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-300 dark:border-gray-700">
        <button
          onClick={handleOpenFolder}
          className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 dark:text-gray-300 transition-colors"
          title="Open Folder"
        >
          📂 Open Folder
        </button>
        <button
          onClick={handleOpenFileDialog}
          className="px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 dark:text-gray-300 transition-colors"
          title="Open File"
        >
          📄
        </button>
      </div>

      {/* File Tree or Empty State */}
      <div className="flex-1 overflow-y-auto py-1">
        {state.sidebarLoading && (
          <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500">Loading...</div>
        )}
        {!state.fileTree && !state.sidebarLoading && (
          <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            Open a folder to browse markdown files
          </div>
        )}
        {state.fileTree && state.fileTree.length === 0 && !state.sidebarLoading && (
          <div className="px-4 py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            No markdown files found in this folder
          </div>
        )}
        {state.fileTree && state.fileTree.length > 0 && renderTree(state.fileTree)}
      </div>

      {/* Root path */}
      {state.fileTreeRoot && (
        <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-sidebar-border truncate">
          {state.fileTreeRoot}
        </div>
      )}
    </div>
  )
}
