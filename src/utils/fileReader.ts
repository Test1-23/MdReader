import { generateFileId, getFileName, extractHeadings } from './markdown'
import type { OpenFile } from '../types'

export type ReadFileFn = (
  filePath: string
) => Promise<{ content: string; size: number; lastModified: number }>

/**
 * Read a dropped File object and build an OpenFile payload.
 * Works in both Electron (uses file.path + IPC) and browser (FileReader).
 * Returns null if the file is not a recognized markdown type.
 */
export async function readDroppedFile(
  file: File,
  readFile: ReadFileFn,
  isElectron: boolean
): Promise<OpenFile | null> {
  const name = file.name.toLowerCase()
  const isMarkdown = name.endsWith('.md') ||
    name.endsWith('.markdown') ||
    name.endsWith('.mdown') ||
    name.endsWith('.mkd') ||
    name.endsWith('.txt')

  if (!isMarkdown) return null

  let content: string
  let filePath: string
  let size: number
  let lastModified: number

  if (isElectron && (file as any).path) {
    filePath = (file as any).path
    // S6: register drag-dropped files as explicitly user-opened before reading
    window.electronAPI?.authorizePath?.(filePath)
    const result = await readFile(filePath)
    content = result.content
    size = result.size
    lastModified = result.lastModified
  } else {
    filePath = ''
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      const timeout = setTimeout(() => reject(new Error('File read timed out')), 30000)
      reader.onload = () => {
        clearTimeout(timeout)
        resolve(reader.result as string)
      }
      reader.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Failed to read file'))
      }
      reader.readAsText(file)
    })
    content = text
    size = file.size
    lastModified = file.lastModified
  }

  const fileName = getFileName(filePath || file.name)
  const fileId = generateFileId(filePath || file.name)
  const headings = extractHeadings(content)

  return {
    fileId,
    filePath,
    fileName,
    content,
    fileSize: size,
    lastModified,
    headings,
  }
}

/** Generate a unique tab ID (used at dispatch sites, not in reducers) */
export function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// E6: shared "read a path and build the OpenFile payload" flow
// (FileTreePanel / EditorGroup / EmptyState all do this inline today).
export async function openFileByPath(filePath: string, readFile: ReadFileFn): Promise<OpenFile> {
  const result = await readFile(filePath)
  const fileName = getFileName(filePath)
  const fileId = generateFileId(filePath)
  const headings = extractHeadings(result.content)
  return {
    fileId,
    filePath,
    fileName,
    content: result.content,
    fileSize: result.size,
    lastModified: result.lastModified,
    headings,
  }
}
