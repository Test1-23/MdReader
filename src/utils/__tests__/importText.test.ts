import { describe, it, expect, vi } from 'vitest'
import {
  tidyMarkdown, sanitizeFileName, suggestFileName, joinPath,
  saveSnippetAsMarkdown,
} from '../importText'
import type { OpenFile } from '../../types'

function fakeOpenFile(path: string): OpenFile {
  return {
    fileId: `file-${path}`, filePath: path, fileName: path.split('/').pop() ?? path,
    content: 'tidied', fileSize: 6, lastModified: 1, headings: [],
  }
}

describe('tidyMarkdown', () => {
  it('normalizes CRLF and CR to LF', () => {
    expect(tidyMarkdown('a\r\nb\rc')).toBe('# a\nb\nc\n')
  })

  it('trims leading and trailing blank lines', () => {
    expect(tidyMarkdown('\n\n\nhello\n\n\n')).toBe('# hello\n')
  })

  it('collapses 3+ blank runs to 2', () => {
    expect(tidyMarkdown('# t\n\n\n\n\n\nrest')).toBe('# t\n\n\nrest\n')
  })

  it('preserves blank runs inside code fences', () => {
    const text = '# t\n\n```\n\n\n\n\n```\n\nend'
    expect(tidyMarkdown(text)).toBe('# t\n\n```\n\n\n\n\n```\n\nend\n')
  })

  it('prepends # to a plain first line', () => {
    expect(tidyMarkdown('just text')).toBe('# just text\n')
  })

  it('leaves an existing heading untouched', () => {
    expect(tidyMarkdown('## Already heading\nbody')).toBe('## Already heading\nbody\n')
  })

  it('does not prepend # when the first line is a fence opener', () => {
    expect(tidyMarkdown('```js\ncode\n```')).toBe('```js\ncode\n```\n')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(tidyMarkdown('   \n\t\n')).toBe('')
  })

  it('keeps a single trailing newline', () => {
    expect(tidyMarkdown('# t\n')).toBe('# t\n')
  })
})

describe('sanitizeFileName', () => {
  it('replaces illegal characters with spaces', () => {
    expect(sanitizeFileName('a:b*c?d')).toBe('a b c d')
  })

  it('strips leading/trailing dots and spaces', () => {
    expect(sanitizeFileName('..name...')).toBe('name')
    expect(sanitizeFileName('  name  ')).toBe('name')
  })

  it('prefixes Windows reserved names', () => {
    expect(sanitizeFileName('CON')).toBe('_CON')
    expect(sanitizeFileName('con')).toBe('_con')
  })

  it('preserves CJK text', () => {
    expect(sanitizeFileName('中文标题')).toBe('中文标题')
  })

  it('truncates to 60 chars without trailing dots', () => {
    const long = 'x'.repeat(100)
    const result = sanitizeFileName(long)
    expect(result).toHaveLength(60)
    expect(result.endsWith('.')).toBe(false)
  })

  it('falls back to import when empty', () => {
    expect(sanitizeFileName('...')).toBe('import')
    expect(sanitizeFileName('   ')).toBe('import')
  })
})

describe('suggestFileName', () => {
  it('derives from the source file name minus extension', () => {
    expect(suggestFileName('# t\n', 'notes.txt')).toBe('notes.md')
  })

  it('derives from the first heading', () => {
    expect(suggestFileName('# My Title\nbody\n', null)).toBe('My Title.md')
  })

  it('sanitizes heading-derived names', () => {
    expect(suggestFileName('# a:b*c\n', null)).toBe('a b c.md')
  })

  it('falls back to import-<ts> for fence-first text (no headings)', () => {
    const name = suggestFileName('```js\ncode\n```\n', null)
    expect(name).toMatch(/^import-\d+\.md$/)
  })
})

describe('joinPath', () => {
  it('joins and strips trailing separators', () => {
    expect(joinPath('C:\\docs\\', 'a.md')).toBe('C:\\docs/a.md')
    expect(joinPath('/home/u', 'a.md')).toBe('/home/u/a.md')
  })
})

describe('saveSnippetAsMarkdown', () => {
  it('folder path: writes into the open folder with overwrite false and opens the returned path', async () => {
    const writeFile = vi.fn(async (args: { filePath: string }) => ({ filePath: args.filePath }))
    const saveDialog = vi.fn()
    const openFileByPath = vi.fn(async (p: string) => fakeOpenFile(p))
    const result = await saveSnippetAsMarkdown('hello world', null, {
      getFileTreeRoot: () => 'C:\\docs',
      writeFile,
      saveDialog,
      openFileByPath,
    })
    expect(result).not.toBeNull()
    expect(writeFile).toHaveBeenCalledWith({
      filePath: 'C:\\docs/hello world.md',
      content: '# hello world\n',
      overwrite: false,
    })
    expect(saveDialog).not.toHaveBeenCalled()
    expect(openFileByPath).toHaveBeenCalledWith('C:\\docs/hello world.md')
    expect(result!.savedDir).toBe('C:\\docs')
  })

  it('dialog path: save dialog with default name, overwrite true', async () => {
    const writeFile = vi.fn(async (args: { filePath: string }) => ({ filePath: args.filePath }))
    const saveDialog = vi.fn(async () => 'D:\\elsewhere\\picked.md')
    const openFileByPath = vi.fn(async (p: string) => fakeOpenFile(p))
    const result = await saveSnippetAsMarkdown('hello', null, {
      getFileTreeRoot: () => null,
      writeFile,
      saveDialog,
      openFileByPath,
    })
    expect(saveDialog).toHaveBeenCalledWith('hello.md')
    expect(writeFile).toHaveBeenCalledWith({
      filePath: 'D:\\elsewhere\\picked.md',
      content: '# hello\n',
      overwrite: true,
    })
    expect(result!.savedDir).toBe('D:\\elsewhere')
  })

  it('cancelled dialog → null and nothing written', async () => {
    const writeFile = vi.fn()
    const saveDialog = vi.fn(async () => null)
    const result = await saveSnippetAsMarkdown('hello', null, {
      getFileTreeRoot: () => null,
      writeFile,
      saveDialog,
      openFileByPath: vi.fn(),
    })
    expect(result).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('uniquified returned path is what gets opened', async () => {
    const writeFile = vi.fn(async () => ({ filePath: 'C:\\docs\\name(1).md' }))
    const openFileByPath = vi.fn(async (p: string) => fakeOpenFile(p))
    await saveSnippetAsMarkdown('hello', 'name.md', {
      getFileTreeRoot: () => 'C:\\docs',
      writeFile,
      saveDialog: vi.fn(),
      openFileByPath,
    })
    expect(openFileByPath).toHaveBeenCalledWith('C:\\docs\\name(1).md')
  })

  it('write rejection propagates', async () => {
    const writeFile = vi.fn(async () => { throw new Error('ENOENT') })
    await expect(saveSnippetAsMarkdown('hello', null, {
      getFileTreeRoot: () => 'C:\\docs',
      writeFile,
      saveDialog: vi.fn(),
      openFileByPath: vi.fn(),
    })).rejects.toThrow('ENOENT')
  })

  it('empty/whitespace text → null, no deps called', async () => {
    const writeFile = vi.fn()
    const saveDialog = vi.fn()
    const result = await saveSnippetAsMarkdown('   \n  ', null, {
      getFileTreeRoot: () => 'C:\\docs',
      writeFile,
      saveDialog,
      openFileByPath: vi.fn(),
    })
    expect(result).toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
    expect(saveDialog).not.toHaveBeenCalled()
  })
})
