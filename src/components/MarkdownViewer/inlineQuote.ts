import type { PendingQuote } from '../../types'

// 内联引用输入框的纯函数辅助（可单测，无 React 依赖）

export const INLINE_BOX_W = 360
export const INLINE_BOX_MAX_H = 252
export const INLINE_TEXTAREA_MAX_H = 200
export const MAX_INLINE_QUOTES = 20

// 追加引用（超出上限静默忽略，输入框保持打开）
export function appendQuote(
  quotes: PendingQuote[],
  quote: PendingQuote,
  max = MAX_INLINE_QUOTES
): PendingQuote[] {
  if (quotes.length >= max) return quotes
  return [...quotes, quote]
}

// 视口内 clamp 定位：选区右侧 +6px，右/下越界时向左/上收，最小留 8px 边距
export function clampInlinePosition(
  rect: { right: number; bottom: number },
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const x = Math.min(Math.max(8, rect.right + 6), Math.max(8, viewportWidth - INLINE_BOX_W - 8))
  const y = Math.min(Math.max(8, rect.bottom + 6), Math.max(8, viewportHeight - INLINE_BOX_MAX_H - 8))
  return { x, y }
}

// 提交规则：有引用 → 空文本也可提交（只把引用填入 AI 窗）；全空 → no-op 保持打开
export function shouldSubmit(text: string, quoteCount: number): boolean {
  if (quoteCount > 0) return true
  return text.trim().length > 0
}
