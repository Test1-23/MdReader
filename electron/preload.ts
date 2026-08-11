import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  // File operations
  readFile: (filePath: string) => Promise<{ content: string; size: number; lastModified: number }>
  readDir: (dirPath: string) => Promise<FileDirEntry[]>
  getFileInfo: (filePath: string) => Promise<{ size: number; lastModified: number } | null>

  // Dialog operations
  openFileDialog: () => Promise<string | null>
  openFolderDialog: () => Promise<string | null>

  // Settings operations
  saveApiConfig: (config: { endpoint: string; apiKey: string; model: string }) => Promise<void>
  loadApiConfig: () => Promise<{ endpoint: string; apiKey: string; model: string } | null>
  clearApiConfig: () => Promise<void>

  // AI operations
  aiChat: (messages: Array<{ role: string; content: string }>, config: { endpoint: string; apiKey: string; model: string }) => Promise<string>
  saveConversation: (id: string, data: unknown) => Promise<void>
  loadConversation: (id: string) => Promise<unknown>
  listConversations: () => Promise<Array<{ id: string; title: string; updatedAt: number }>>
  deleteConversation: (id: string) => Promise<void>
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

  saveApiConfig: (config) => ipcRenderer.invoke('settings:saveApiConfig', config),
  loadApiConfig: () => ipcRenderer.invoke('settings:loadApiConfig'),
  clearApiConfig: () => ipcRenderer.invoke('settings:clearApiConfig'),

  aiChat: (messages, config) => ipcRenderer.invoke('ai:chat', messages, config),
  saveConversation: (id, data) => ipcRenderer.invoke('ai:saveConversation', id, data),
  loadConversation: (id) => ipcRenderer.invoke('ai:loadConversation', id),
  listConversations: () => ipcRenderer.invoke('ai:listConversations'),
  deleteConversation: (id) => ipcRenderer.invoke('ai:deleteConversation', id),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
