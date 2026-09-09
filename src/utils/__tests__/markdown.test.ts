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

  it('normalizes inline HTML and escapes in heading text', () => {
    expect(extractHeadings('## HTML <span class="x">hi</span>')[0].text).toBe('HTML hi')
    expect(extractHeadings('## A\\nB')[0].text).toBe('A B')
    expect(extractHeadings('## A<br>B')[0].text).toBe('A B')
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

  it('normalizes inline HTML so the anchor id matches the rendered heading', () => {
    expect(headingToId('HTML <span class="x">hi</span>')).toBe('html-hi')
    expect(headingToId('A<b>x</b> B')).toBe('ax-b')
  })

  it('treats <br> and a literal \\n escape as separators (matching the rendered path)', () => {
    // '\\n' here is the two-character escape (backslash + n), not a newline
    expect(headingToId('A<br>B')).toBe('a-b')
    expect(headingToId('A<BR/>B')).toBe('a-b')
    expect(headingToId('A\\nB')).toBe('a-b')
    // rendered path yields 'A \nB' for the escape (break → <br> + newline sibling)
    expect(headingToId('A \nB')).toBe(headingToId('A\\nB'))
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
