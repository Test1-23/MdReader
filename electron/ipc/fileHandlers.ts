import { IpcMain } from 'electron'
import { open, readdir, stat } from 'fs/promises'
import { extname, join, resolve, sep } from 'path'
import type { FileDirEntry } from '../../src/types/ipc'
import { IPC_CHANNELS } from './channels'
import { assertTrustedSender } from './security'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // P7: reject files beyond 20MB with a clear error

// B19f: decode with encoding detection — UTF-8 BOM / strict UTF-8 / UTF-16,
// falling back to GBK for Chinese Windows files (Electron ships full ICU).
function decodeBuffer(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.toString('utf8', 3)
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le', 2)
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return buf.swap16().toString('utf16le', 2)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf)
    } catch {
      return buf.toString('utf8')
    }
  }
}

// S6: only paths the user explicitly opened (folder dialog / file dialog /
// drag-drop) may be read. Dialog handlers auto-authorize; the renderer calls
// file:authorizePath for drag-dropped files.
const authorizedRoots = new Set<string>()

function normalizePath(p: string): string {
  const resolved = resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function authorizePath(p: string): void {
  authorizedRoots.add(normalizePath(p))
}

export function isAuthorized(filePath: string): boolean {
  const target = normalizePath(filePath)
  for (const root of authorizedRoots) {
    if (target === root) return true
    if (target.startsWith(root.endsWith(sep) ? root : root + sep)) return true
  }
  return false
}

export function registerFileHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (event, filePath: string) => {
    assertTrustedSender(event)
    try {
      // S6: only paths the user explicitly opened (folder dialog / file dialog /
      // drag-drop) may be read.
      if (!isAuthorized(filePath)) {
        throw new Error('File not authorized — open it via the file dialog, folder explorer, or drag & drop')
      }
      const stats = await stat(filePath)
      // P7: reading a multi-hundred-MB log file whole + structured-cloning it
      // over IPC would OOM — reject clearly instead.
      if (stats.size > MAX_FILE_SIZE) {
        throw new Error(`File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB, limit 20MB)`)
      }
      // B19l: read size/mtime and content from the same open handle so the
      // returned stats always describe the content that was actually read.
      const handle = await open(filePath, 'r')
      try {
        const fstats = await handle.stat()
        const content = decodeBuffer(await handle.readFile())
        return {
          content,
          size: fstats.size,
          lastModified: fstats.mtimeMs,
        }
      } finally {
        await handle.close()
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to read file: ${filePath} — ${msg}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_AUTHORIZE_PATH, (event, p: unknown) => {
    assertTrustedSender(event)
    if (typeof p === 'string' && p.length > 0) {
      authorizePath(p)
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_READ_DIR, async (event, dirPath: string) => {
    assertTrustedSender(event)
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const result: FileDirEntry[] = entries
        .filter((entry) => {
          // Show directories and markdown/text files
          if (entry.isDirectory()) return !entry.name.startsWith('.')
          if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase()
            return ['.md', '.markdown', '.txt', '.mdown', '.mkd'].includes(ext)
          }
          return false
        })
        .map((entry) => ({
          name: entry.name,
          path: join(dirPath, entry.name),
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          extension: entry.isFile() ? extname(entry.name).toLowerCase() : '',
        }))
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })

      return result
    } catch (error) {
      // B19k: keep the original errno so permission errors and missing paths
      // are distinguishable.
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to read directory: ${dirPath} — ${msg}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_GET_INFO, async (event, filePath: string) => {
    assertTrustedSender(event)
    try {
      const stats = await stat(filePath)
      return {
        size: stats.size,
        lastModified: stats.mtimeMs,
      }
    } catch (error) {
      console.error(`getFileInfo failed for ${filePath}:`, error)
      return null
    }
  })
}
