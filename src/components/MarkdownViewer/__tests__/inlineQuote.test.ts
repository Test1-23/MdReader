import { describe, it, expect } from 'vitest'
import {
  appendQuote, clampInlinePosition, shouldSubmit,
  MAX_INLINE_QUOTES, INLINE_BOX_W, INLINE_BOX_MAX_H,
} from '../inlineQuote'

const q = (id: string) => ({ id, text: `quote ${id}` })

describe('appendQuote', () => {
  it('appends quotes up to the cap', () => {
    const quotes = Array.from({ length: 19 }, (_, i) => q(`q${i}`))
    const result = appendQuote(quotes, q('new'))
    expect(result).toHaveLength(20)
    expect(result[19].id).toBe('new')
  })

  it('silently ignores appends beyond the cap', () => {
    const quotes = Array.from({ length: MAX_INLINE_QUOTES }, (_, i) => q(`q${i}`))
    expect(appendQuote(quotes, q('overflow'))).toBe(quotes)
  })
})

describe('clampInlinePosition', () => {
  it('places the box at selection end with a 6px offset', () => {
    expect(clampInlinePosition({ right: 100, bottom: 200 }, 1920, 1080))
      .toEqual({ x: 106, y: 206 })
  })

  it('clamps against the right edge', () => {
    const { x } = clampInlinePosition({ right: 1900, bottom: 200 }, 1920, 1080)
    expect(x).toBe(1920 - INLINE_BOX_W - 8)
  })

  it('clamps against the bottom edge', () => {
    const { y } = clampInlinePosition({ right: 100, bottom: 1070 }, 1920, 1080)
    expect(y).toBe(1080 - INLINE_BOX_MAX_H - 8)
  })

  it('keeps a minimum 8px margin on tiny viewports', () => {
    const pos = clampInlinePosition({ right: 0, bottom: 0 }, 200, 100)
    expect(pos.x).toBeGreaterThanOrEqual(8)
    expect(pos.y).toBeGreaterThanOrEqual(8)
  })
})

describe('shouldSubmit', () => {
  it('empty text with quotes → submit (chips only)', () => {
    expect(shouldSubmit('  ', 2)).toBe(true)
  })

  it('empty text without quotes → no-op', () => {
    expect(shouldSubmit('', 0)).toBe(false)
    expect(shouldSubmit('   ', 0)).toBe(false)
  })

  it('text with or without quotes → submit', () => {
    expect(shouldSubmit('question', 0)).toBe(true)
    expect(shouldSubmit('question', 1)).toBe(true)
  })
})
