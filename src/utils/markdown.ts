import type { Heading } from '../types'

/**
 * Extract headings from markdown content.
 * Returns an array of { level, text, line }.
 */
export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
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
  // Simple hash of the path
  let hash = 0
  for (let i = 0; i < filePath.length; i++) {
    const char = filePath.charCodeAt(i)
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

/**
 * Get the display name from a file path (last segment).
 */
export function getFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}
