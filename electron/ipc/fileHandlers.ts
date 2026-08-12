import { IpcMain } from 'electron'
import { readFile, readdir, stat } from 'fs/promises'
import { extname, join } from 'path'
import type { FileDirEntry } from '../../src/types/ipc'
import { IPC_CHANNELS } from './channels'

export function registerFileHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      const stats = await stat(filePath)
      return {
        content,
        size: stats.size,
        lastModified: stats.mtimeMs,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to read file: ${filePath} — ${msg}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_READ_DIR, async (_event, dirPath: string) => {
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
      throw new Error(`Failed to read directory: ${dirPath}`)
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_GET_INFO, async (_event, filePath: string) => {
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
