import { describe, it, expect } from 'vitest'
import { extractHeadings, generateFileId, headingToId, isMarkdownFile } from '../markdown'

describe('extractHeadings', () => {
  it('B19e: ignores `#` lines inside code fences', () => {
    const content = [
      '# Real heading',
      '```python',
      '# not a heading',
      '## also not a heading',
      '```',
      '## Real second',
    ].join('\n')
    const headings = extractHeadings(content)
    expect(headings.map((h) => h.text)).toEqual(['Real heading', 'Real second'])
  })

  it('B19e: strips trailing closing hashes', () => {
    const headings = extractHeadings('## Title ##')
    expect(headings[0].text).toBe('Title')
    expect(headings[0].level).toBe(2)
  })

  it('tracks fenced blocks opened/closed on the same line', () => {
    const headings = extractHeadings('```\n```\n# real\n~~~\n# fake\n~~~\n## real2')
    expect(headings.map((h) => h.text)).toEqual(['real', 'real2'])
  })
})

describe('generateFileId', () => {
  it('B20g: is case-insensitive (Windows path semantics)', () => {
    expect(generateFileId('C:\\Docs\\File.MD')).toBe(generateFileId('c:\\docs\\file.md'))
  })

  it('produces a stable id per path', () => {
    expect(generateFileId('/a/b.md')).toBe(generateFileId('/a/b.md'))
    expect(generateFileId('/a/b.md')).not.toBe(generateFileId('/a/c.md'))
  })
})

describe('headingToId', () => {
  it('strips inline markdown so raw text and rendered text agree', () => {
    // input is heading TEXT (the `##` marker is already stripped by extractHeadings)
    expect(headingToId('Hello **World**')).toBe('hello-world')
    expect(headingToId('[Title](https://example.com)')).toBe('title')
    expect(headingToId('`code` span')).toBe('code-span')
    expect(headingToId('Hello  World')).toBe('hello-world')
  })
})

describe('isMarkdownFile', () => {
  it('accepts markdown and text extensions, case-insensitively', () => {
    expect(isMarkdownFile('a.md')).toBe(true)
    expect(isMarkdownFile('a.MD')).toBe(true)
    expect(isMarkdownFile('a.markdown')).toBe(true)
    expect(isMarkdownFile('a.txt')).toBe(true)
    expect(isMarkdownFile('a.png')).toBe(false)
    expect(isMarkdownFile('.md')).toBe(false) // dotfile, not a real extension
  })
})
