// E19: shared Tailwind class strings — duplicated 3× each in the original code.

/** 主按钮（accent blue-600，现代柔和） */
export const PRIMARY_BTN =
  'px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:bg-blue-200 disabled:text-blue-400 disabled:cursor-not-allowed'

/** 次级按钮（ToolbarButton 同款基类） */
export const SECONDARY_BTN =
  'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] rounded-lg border border-chrome-border bg-chrome-surface hover:bg-chrome-hover text-chrome-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** Small icon/view-toggle button (AI panel header) */
export const VIEW_BTN_INACTIVE =
  'text-chrome-text-muted hover:bg-chrome-hover'

/** Context-menu item row (GroupTabs) — soft hover */
export const MENU_ITEM =
  'mx-1 px-2.5 py-1.5 rounded-md hover:bg-chrome-hover cursor-pointer text-[13px]'

/** Tiny action button base (ChatBubble) */
export const BTN_BASE =
  'inline-flex items-center gap-1 px-1.5 py-1 text-[10px] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/** ChatBubble 操作按钮的配色（4 处共用） */
export const CHAT_ACTION_BTN =
  'text-chrome-text-faint hover:text-chrome-text hover:bg-chrome-hover'

/** 空态提示文字（侧栏/会话列表共用） */
export const EMPTY_HINT = 'px-4 py-8 text-center text-xs text-chrome-text-faint'
