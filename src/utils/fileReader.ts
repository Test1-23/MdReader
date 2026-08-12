import { generateFileId, getFileName, extractHeadings, isMarkdownFile } from './markdown'
import type { OpenFile } from '../types'

export type ReadFileFn = (
  filePath: string
) => Promise<{ content: string; size: number; lastModified: number }>

// B19f/R7: shared text decoding with encoding detection. The browser path used
// to assume UTF-8 (GBK/GB2312 files rendered as garbage); the same strategy is
// mirrored in the main process for the Electron path.
export function decodeText(buffer: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buffer)

  // BOM sniffing
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  }

  // Strict UTF-8 validation; fall back to GBK for Chinese Windows files
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {
    try {
      return { text: new TextDecoder('gbk').decode(bytes), encoding: 'gbk' }
    } catch {
      return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8-lossy' }
    }
  }
}

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
  if (!isMarkdownFile(file.name)) return null

  let content: string
  let filePath: string
  let size: number
  let lastModified: number

  if (isElectron && (file as File & { path?: string }).path) {
    filePath = (file as File & { path?: string }).path!
    // S6: register drag-dropped files as explicitly user-opened before reading
    window.electronAPI?.authorizePath?.(filePath)
    const result = await readFile(filePath)
    content = result.content
    size = result.size
    lastModified = result.lastModified
  } else {
    filePath = ''
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      const timeout = setTimeout(() => reject(new Error('File read timed out')), 30000)
      reader.onload = () => {
        clearTimeout(timeout)
        resolve(reader.result as ArrayBuffer)
      }
      reader.onerror = () => {
        clearTimeout(timeout)
        reject(new Error('Failed to read file'))
      }
      reader.readAsArrayBuffer(file)
    })
    content = decodeText(buffer).text
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

// E7: shared drop pipeline — filter markdown files, read, skip failures.
// Callers decide how to dispatch the resulting OpenFile payloads.
export async function readDroppedMarkdownFiles(
  files: File[],
  readFile: ReadFileFn,
  isElectron: boolean
): Promise<OpenFile[]> {
  const mdFiles = files.filter((f) => isMarkdownFile(f.name))
  const results: OpenFile[] = []
  for (const file of mdFiles) {
    try {
      const openFile = await readDroppedFile(file, readFile, isElectron)
      if (openFile) results.push(openFile)
    } catch { /* skip failed files */ }
  }
  return results
}

// E8: unified id factory (prefix + timestamp + entropy)
export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

/** Generate a unique tab ID (used at dispatch sites, not in reducers) */
export function generateTabId(): string {
  return createId('tab')
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
