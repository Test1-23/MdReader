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
