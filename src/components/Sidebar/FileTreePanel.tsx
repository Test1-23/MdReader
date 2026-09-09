import { useState, useCallback, memo } from 'react'
import { useLatestRef } from '../../hooks/useLatestRef'
import { useLayoutContext, useUIDispatch } from '../../context/AppContext'
import { useElectronAPI } from '../../hooks/useElectronAPI'
import { openFileByPath, generateTabId, readDroppedMarkdownFiles } from '../../utils/fileReader'
import { saveSnippetAsMarkdown } from '../../utils/importText'
import { getFileName } from '../../utils/markdown'
import type { FileTreeNode, FileDirEntry } from '../../types'
import { ChevronDown, ChevronRight, FolderOpen, Folder, FileText, Import } from 'lucide-react'
import { ImportDialog } from './ImportDialog'
import type { ImportSeed } from './ImportDialog'
import { ToolbarButton } from '../shared/ToolbarButton'
import { EMPTY_HINT } from '../shared/classes'

/** 错误信息提取 —— 把底层原因带给用户，而不是笼统的"失败" */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// 目录条目 → 树节点（面板内三处使用，抽为单一实现）
function entriesToNodes(entries: FileDirEntry[]): FileTreeNode[] {
  return entries.map((entry: FileDirEntry) => ({
    name: entry.name,
    path: entry.path,
    isDirectory: entry.isDirectory,
    isFile: entry.isFile,
    extension: entry.extension,
    children: undefined,
    loaded: false,
  }))
}

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
  const Icon = node.isDirectory
    ? (isExpanded ? FolderOpen : Folder)
    : FileText
  return (
    <div>
      <div
        className="flex items-center gap-1 px-2.5 py-1 rounded-md cursor-pointer hover:bg-chrome-hover text-[13px] text-chrome-text"
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
          <span className="w-4 text-chrome-text-faint flex-shrink-0 flex items-center justify-center">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        {node.isFile && <span className="w-4 flex-shrink-0" />}

        {/* Icon */}
        <Icon size={14} className="text-chrome-text-faint shrink-0" />

        {/* Name */}
        <span className="truncate">
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
  const { openFolderDialog, openFileDialog, readDir, readFile, writeFile, saveFileDialog, isElectron } = useElectronAPI()
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const expandedRef = useLatestRef(expandedDirs)
  // keep the module-scope set in sync for the memoized nodes
  expandedChildren.clear()
  for (const p of expandedDirs) expandedChildren.add(p)

  // ---- 文本片段导入状态 ----
  const [showImport, setShowImport] = useState(false)
  const [importSeed, setImportSeed] = useState<ImportSeed | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  const handleOpenFolder = useCallback(async () => {
    try {
      const folderPath = await openFolderDialog()
      if (!folderPath) return

      layoutDispatch({ type: 'SET_SIDEBAR_LOADING', payload: true })

      const entries = await readDir(folderPath)
      const nodes = entriesToNodes(entries)

      layoutDispatch({
        type: 'SET_FILE_TREE_ROOT',
        payload: { root: folderPath, nodes },
      })

      setExpandedDirs(new Set())
    } catch (err) {
      layoutDispatch({ type: 'SET_SIDEBAR_LOADING', payload: false })
      uiDispatch({ type: 'SET_ERROR', payload: `打开文件夹失败：${errText(err)}` })
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
        const children = entriesToNodes(entries)
        layoutDispatch({ type: 'SET_CHILDREN', payload: { parentPath: node.path, children } })
      } catch (err) {
        layoutDispatch({ type: 'SET_SIDEBAR_LOADING', payload: false })
        uiDispatch({ type: 'SET_ERROR', payload: `读取目录失败：${node.name} — ${errText(err)}` })
      }
    }
  }, [readDir, layoutDispatch, uiDispatch])

  const handleOpenFile = useCallback(async (filePath: string) => {
    try {
      // E6: shared path→OpenFile flow
      const openFile = await openFileByPath(filePath, readFile)
      layoutDispatch({ type: 'OPEN_FILE', payload: { ...openFile, tabId: generateTabId() } })
    } catch (err) {
      uiDispatch({ type: 'SET_ERROR', payload: `打开文件失败：${filePath} — ${errText(err)}` })
    }
  }, [readFile, layoutDispatch, uiDispatch])

  const handleOpenFileDialog = useCallback(async () => {
    try {
      const filePath = await openFileDialog()
      if (!filePath) return
      await handleOpenFile(filePath)
    } catch (err) {
      uiDispatch({ type: 'SET_ERROR', payload: `打开文件失败：${errText(err)}` })
    }
  }, [openFileDialog, handleOpenFile, uiDispatch])

  // ---- 文本片段导入 ----

  // 「选择文件」→ 读入内容填充导入对话框（源名用于建议文件名）
  const handlePickFile = useCallback(async () => {
    try {
      const filePath = await openFileDialog()
      if (!filePath) return
      const result = await readFile(filePath)
      setImportSeed({ text: result.content, sourceName: getFileName(filePath) })
    } catch (err) {
      uiDispatch({ type: 'SET_ERROR', payload: `读取文件失败：${errText(err)}` })
    }
  }, [openFileDialog, readFile, uiDispatch])

  // 拖拽 .txt/.md 到面板 → 内容填充导入对话框
  const handlePanelDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation() // 防全局 drop 处理器重复打开 tab
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return
    const { opened, errors } = await readDroppedMarkdownFiles(Array.from(e.dataTransfer.files), readFile, isElectron)
    if (opened.length === 0) {
      uiDispatch({
        type: 'SET_ERROR',
        payload: errors.length > 0 ? errors[0] : 'No markdown file found in the dropped items.',
      })
      return
    }
    setImportSeed({
      text: opened.map((o) => o.content).join('\n\n'),
      sourceName: opened[0].fileName,
    })
    setShowImport(true)
  }, [readFile, isElectron, uiDispatch])

  // 转换为 .md：整理 → 落盘（已开文件夹直存 / 否则保存对话框）→ 打开 + 树刷新
  const handleImportConfirm = useCallback(async (text: string) => {
    if (importBusy) return
    setImportBusy(true)
    try {
      const res = await saveSnippetAsMarkdown(text, importSeed?.sourceName ?? null, {
        getFileTreeRoot: () => layoutState.fileTreeRoot,
        writeFile,
        saveDialog: saveFileDialog,
        openFileByPath: (p) => openFileByPath(p, readFile),
      })
      if (!res) return // 取消或空文本 → 无副作用，对话框保持打开
      layoutDispatch({ type: 'OPEN_FILE', payload: { ...res.openFile, tabId: generateTabId() } })
      // 存入已开文件夹根目录时刷新树（展开状态重置，与 handleOpenFolder 一致）
      if (layoutState.fileTreeRoot && res.savedDir === layoutState.fileTreeRoot) {
        const entries = await readDir(layoutState.fileTreeRoot)
        layoutDispatch({
          type: 'SET_FILE_TREE_ROOT',
          payload: { root: layoutState.fileTreeRoot, nodes: entriesToNodes(entries) },
        })
        setExpandedDirs(new Set())
      }
      setShowImport(false)
      setImportSeed(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      uiDispatch({ type: 'SET_ERROR', payload: `导入失败：${msg}` })
    } finally {
      setImportBusy(false)
    }
  }, [importBusy, importSeed, layoutState.fileTreeRoot, writeFile, saveFileDialog, readFile, readDir, layoutDispatch, uiDispatch])

  return (
    <div
      className="flex flex-col h-full"
      data-import-drop-zone
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={handlePanelDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-chrome-border">
        <ToolbarButton
          icon={FolderOpen}
          label="Open Folder"
          title="Open Folder"
          onClick={handleOpenFolder}
          className="flex-1 justify-center"
        />
        <ToolbarButton
          icon={FileText}
          title="Open File"
          onClick={handleOpenFileDialog}
        />
        <ToolbarButton
          icon={Import}
          title="导入"
          onClick={() => setShowImport(true)}
        />
      </div>

      {/* File Tree or Empty State */}
      <div className="flex-1 overflow-y-auto py-1">
        {layoutState.sidebarLoading && (
          <div className="px-4 py-2 text-xs text-chrome-text-muted">Loading...</div>
        )}
        {!layoutState.fileTree && !layoutState.sidebarLoading && (
          <div className={EMPTY_HINT}>
            Open a folder to browse markdown files
          </div>
        )}
        {layoutState.fileTree && layoutState.fileTree.length === 0 && !layoutState.sidebarLoading && (
          <div className={EMPTY_HINT}>
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
        <div className="px-3 py-2 text-xs text-chrome-text-faint border-t border-chrome-border truncate">
          {layoutState.fileTreeRoot}
        </div>
      )}

      {/* 文本片段导入对话框 */}
      {showImport && (
        <ImportDialog
          seed={importSeed}
          busy={importBusy}
          onClose={() => setShowImport(false)}
          onConfirm={handleImportConfirm}
          onPickFile={handlePickFile}
        />
      )}
    </div>
  )
}
