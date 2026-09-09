import type { Heading } from '../types'

/**
 * Extract headings from markdown content.
 * Returns an array of { level, text, line }.
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  const lines = content.split('\n')
  // B19e: track code fences — a `# comment` inside a code block is not a heading
  let inFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        // B19e: strip trailing closing hashes (`## Title ##` → `Title`);
        // 归一化 HTML/转义符，使大纲 id 与渲染锚点 id 一致
        text: normalizeHeadingText(match[2].trim().replace(/\s+#+\s*$/, '')),
        line: i,
      })
    }
  }

  return headings
}

/**
 * Generate a unique file ID from a file path.
 */
export function generateFileId(filePath: string): string {
  if (!filePath) {
    return `pasted-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  }
  // B20g: normalize case so C:\A.md and c:\a.md map to the same file on Windows
  const normalized = filePath.toLowerCase()
  // Simple hash of the path
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `file-${Math.abs(hash).toString(36)}`
}

/**
 * Check if a file extension indicates a markdown file.
 */
export function isMarkdownExtension(ext: string): boolean {
  return ['.md', '.markdown', '.mdown', '.mkd', '.txt'].includes(ext.toLowerCase())
}

// E1: name-based check shared by all drop/file-picker filters
export function isMarkdownFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  return isMarkdownExtension(name.slice(dot))
}

/**
 * Normalize raw heading source so its id matches the rendered heading's id.
 * Raw HTML tags become elements (their text content stays), and a literal
 * two-char `\n` escape becomes a <br> — both act as word separators, which is
 * what the rendered path produces too (mdast `break` emits <br> plus a newline
 * text sibling).
 */
function normalizeHeadingText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\\n/g, ' ')
}

/** Strip inline markdown syntax so raw heading text matches rendered text */
function stripInlineMarkdown(text: string): string {
  return normalizeHeadingText(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
}

// E3: the single heading→id algorithm — MarkdownViewer anchors and OutlinePanel
// navigation must always agree.
export function headingToId(text: string): string {
  return stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w一-鿿-]/g, '')
}

/**
 * Get the display name from a file path (last segment).
 */
export function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}
