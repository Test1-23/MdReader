// Shared IPC type contracts — used by electron/ handlers, preload, and the renderer.
// Keeps the wire format defined in exactly one place.

export interface ApiConfig {
  endpoint: string
  apiKey: string
  model: string
}

// What the renderer is allowed to see (never includes the API key).
export interface PublicApiConfig {
  endpoint: string
  model: string
  hasKey: boolean
}

// Renderer-side request config for ai:chat / ai:chatStream — the main process
// attaches the API key from disk itself (S1).
export interface ChatRequestConfig {
  endpoint: string
  model: string
  thinking?: boolean
}

export interface ChatMessage {
  role: string
  content: string
}

export interface FileDirEntry {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  extension: string
}

export interface FileReadResult {
  content: string
  size: number
  lastModified: number
}

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: number
}
