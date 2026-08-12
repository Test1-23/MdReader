import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/channels'
import type {
  ApiConfig, ChatMessage, FileDirEntry, FileReadResult, ConversationSummary,
} from '../src/types/ipc'

export interface ElectronAPI {
  // File operations
  readFile: (filePath: string) => Promise<FileReadResult>
  readDir: (dirPath: string) => Promise<FileDirEntry[]>
  getFileInfo: (filePath: string) => Promise<{ size: number; lastModified: number } | null>
  authorizePath: (path: string) => Promise<void>

  // Dialog operations
  openFileDialog: () => Promise<string | null>
  openFolderDialog: () => Promise<string | null>

  // Settings operations
  saveApiConfig: (config: ApiConfig) => Promise<void>
  loadApiConfig: () => Promise<ApiConfig | null>
  clearApiConfig: () => Promise<void>

  // AI operations
  aiChat: (messages: ChatMessage[], config: ApiConfig) => Promise<string>
  aiChatStream: (requestId: string, messages: ChatMessage[], config: ApiConfig) => Promise<void>
  cancelAiStream: (requestId: string) => Promise<void>
  onAiChunk: (cb: (data: { requestId: string; delta: string }) => void) => () => void
  onAiReasoning: (cb: (data: { requestId: string; delta: string }) => void) => () => void
  onAiDone: (cb: (data: { requestId: string }) => void) => () => void
  onAiError: (cb: (data: { requestId: string; message: string }) => void) => () => void
  onAiCancelled: (cb: (data: { requestId: string }) => void) => () => void
  saveConversation: (id: string, data: unknown) => Promise<void>
  loadConversation: (id: string) => Promise<unknown>
  listConversations: () => Promise<ConversationSummary[]>
  deleteConversation: (id: string) => Promise<void>
}

function subscribe<T>(channel: string, cb: (data: T) => void): () => void {
  const listener = (_e: unknown, data: T) => cb(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const electronAPI: ElectronAPI = {
  readFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),
  readDir: (dirPath) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ_DIR, dirPath),
  getFileInfo: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FILE_GET_INFO, filePath),
  authorizePath: (path) => ipcRenderer.invoke(IPC_CHANNELS.FILE_AUTHORIZE_PATH, path),

  openFileDialog: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE),
  openFolderDialog: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FOLDER),

  saveApiConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, config),
  loadApiConfig: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_LOAD),
  clearApiConfig: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_CLEAR),

  aiChat: (messages, config) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, messages, config),
  aiChatStream: (requestId, messages, config) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_STREAM, requestId, messages, config),
  cancelAiStream: (requestId) => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL_STREAM, requestId),
  onAiChunk: (cb) => subscribe<{ requestId: string; delta: string }>(IPC_CHANNELS.AI_CHUNK, cb),
  onAiReasoning: (cb) => subscribe<{ requestId: string; delta: string }>(IPC_CHANNELS.AI_REASONING, cb),
  onAiDone: (cb) => subscribe<{ requestId: string }>(IPC_CHANNELS.AI_DONE, cb),
  onAiError: (cb) => subscribe<{ requestId: string; message: string }>(IPC_CHANNELS.AI_ERROR, cb),
  onAiCancelled: (cb) => subscribe<{ requestId: string }>(IPC_CHANNELS.AI_CANCELLED, cb),
  saveConversation: (id, data) => ipcRenderer.invoke(IPC_CHANNELS.AI_SAVE_CONVERSATION, id, data),
  loadConversation: (id) => ipcRenderer.invoke(IPC_CHANNELS.AI_LOAD_CONVERSATION, id),
  listConversations: () => ipcRenderer.invoke(IPC_CHANNELS.AI_LIST_CONVERSATIONS),
  deleteConversation: (id) => ipcRenderer.invoke(IPC_CHANNELS.AI_DELETE_CONVERSATION, id),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
