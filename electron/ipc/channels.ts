// IPC channel name registry — single source of truth shared by preload and all handlers.
// Typo in a channel name becomes a compile error instead of a runtime `undefined`.

export const IPC_CHANNELS = {
  // File operations
  FILE_READ: 'file:read',
  FILE_READ_DIR: 'file:readDir',
  FILE_GET_INFO: 'file:getInfo',
  FILE_AUTHORIZE_PATH: 'file:authorizePath',

  // Dialog operations
  DIALOG_OPEN_FILE: 'dialog:openFile',
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',

  // Settings operations
  SETTINGS_SAVE: 'settings:saveApiConfig',
  SETTINGS_LOAD: 'settings:loadApiConfig',
  SETTINGS_CLEAR: 'settings:clearApiConfig',

  // AI chat
  AI_CHAT: 'ai:chat',
  AI_CHAT_STREAM: 'ai:chatStream',
  AI_CANCEL_STREAM: 'ai:cancelStream',
  // AI stream events (main → renderer)
  AI_CHUNK: 'ai:chat-chunk',
  AI_REASONING: 'ai:chat-reasoning',
  AI_DONE: 'ai:chat-done',
  AI_ERROR: 'ai:chat-error',
  AI_CANCELLED: 'ai:chat-cancelled',

  // Conversation persistence
  AI_SAVE_CONVERSATION: 'ai:saveConversation',
  AI_LOAD_CONVERSATION: 'ai:loadConversation',
  AI_LIST_CONVERSATIONS: 'ai:listConversations',
  AI_DELETE_CONVERSATION: 'ai:deleteConversation',
} as const
