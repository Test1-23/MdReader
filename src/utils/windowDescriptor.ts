// ---- 统一窗口描述 ----
// .md 文件窗口与 AI 对话窗口共用同一套打开/复用/关闭机制

export type WindowKind = 'file' | 'ai-chat'

export interface WindowDescriptor {
  windowId: string // .md: fileId；AI: AI_WINDOW_ID
  title: string
  kind: WindowKind
}

// AI 对话窗口固定 id（作为 tab.fileId，使去重激活/关闭回收/拖拽分屏复用现有机制）
export const AI_WINDOW_ID = '__ai_chat_window__'
