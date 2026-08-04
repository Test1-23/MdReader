import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  // File operations
  readFile: (filePath: string) => Promise<{ content: string; size: number; lastModified: number }>
  readDir: (dirPath: string) => Promise<FileDirEntry[]>
  getFileInfo: (filePath: string) => Promise<{ size: number; lastModified: number } | null>

  // Dialog operations
  openFileDialog: () => Promise<string | null>
  openFolderDialog: () => Promise<string | null>
}

export interface FileDirEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  extension: string
}

const electronAPI: ElectronAPI = {
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  readDir: (dirPath: string) => ipcRenderer.invoke('file:readDir', dirPath),
  getFileInfo: (filePath: string) => ipcRenderer.invoke('file:getInfo', filePath),

  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:openFolder'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
