import { describe, it, expect } from 'vitest'
import { transformBreakEscapes } from '../remarkBreakEscapes'

// 注意：本文件里的 '\\n' 是【两个字符】——反斜杠 + n（源码中的字面转义序列），
// 不是换行符。'\n'（单反斜杠）才是真正的换行。
const ESC = '\\n'

type Node = { type: string; value?: string; children?: Node[] }

const text = (value: string): Node => ({ type: 'text', value })
const brk: Node = { type: 'break' }
const para = (...children: Node[]): Node => ({ type: 'paragraph', children })

function transform(...children: Node[]): Node {
  const tree: Node = { type: 'root', children }
  transformBreakEscapes(tree)
  return tree
}

describe('transformBreakEscapes', () => {
  it('splits a simple escape into text/break/text', () => {
    const tree = transform(para(text(`a${ESC}b`)))
    expect(tree.children![0].children).toEqual([text('a'), brk, text('b')])
  })

  it('handles an escape at the start', () => {
    const tree = transform(para(text(`${ESC}foo`)))
    expect(tree.children![0].children).toEqual([brk, text('foo')])
  })

  it('handles an escape at the end', () => {
    const tree = transform(para(text(`foo${ESC}`)))
    expect(tree.children![0].children).toEqual([text('foo'), brk])
  })

  it('handles consecutive escapes', () => {
    const tree = transform(para(text(`a${ESC}${ESC}b`)))
    expect(tree.children![0].children).toEqual([text('a'), brk, brk, text('b')])
  })

  it('an escape-only text node becomes a single break (no empty text nodes)', () => {
    const tree = transform(para(text(ESC)))
    expect(tree.children![0].children).toEqual([brk])
  })

  it('leaves text without escapes untouched (same node identity)', () => {
    const node = text('a b')
    const tree = transform(para(node))
    expect(tree.children![0].children![0]).toBe(node)
  })

  it('splits multiple text nodes', () => {
    const tree = transform(para(text(`a${ESC}b`), text(' and '), text(`c${ESC}d`)))
    expect(tree.children![0].children).toEqual([
      text('a'), brk, text('b'), text(' and '), text('c'), brk, text('d'),
    ])
  })

  it('recurses into nested inline containers', () => {
    const tree = transform(para(
      { type: 'emphasis', children: [text(`a${ESC}b`)] },
      { type: 'link', children: [text(`c${ESC}d`)] },
      { type: 'tableCell', children: [text(`e${ESC}f`)] },
      { type: 'delete', children: [text(`g${ESC}h`)] },
    ))
    const kids = tree.children![0].children!
    expect(kids[0].children).toEqual([text('a'), brk, text('b')])
    expect(kids[1].children).toEqual([text('c'), brk, text('d')])
    expect(kids[2].children).toEqual([text('e'), brk, text('f')])
    expect(kids[3].children).toEqual([text('g'), brk, text('h')])
  })

  it('recurses into headings', () => {
    const tree = transform({ type: 'heading', children: [text(`A${ESC}B`)] })
    expect(tree.children![0].children).toEqual([text('A'), brk, text('B')])
  })

  it('never touches code, inlineCode, math or html nodes', () => {
    const code: Node = { type: 'code', value: `a${ESC}b` }
    const inlineCode: Node = { type: 'inlineCode', value: `a${ESC}b` }
    const inlineMath: Node = { type: 'inlineMath', value: `a${ESC}b` }
    const math: Node = { type: 'math', value: `a${ESC}b` }
    const html: Node = { type: 'html', value: `<span>a${ESC}b</span>` }
    const tree = transform(para(code, inlineCode, inlineMath, math, html))
    expect(tree.children![0].children).toEqual([code, inlineCode, inlineMath, math, html])
  })

  it('is idempotent (break is not a text node)', () => {
    const tree = transform(para(text(`a${ESC}b`)))
    transformBreakEscapes(tree)
    expect(tree.children![0].children).toEqual([text('a'), brk, text('b')])
  })

  it('KNOWN LIMITATION: a CommonMark-escaped \\\\n is indistinguishable from \\n', () => {
    // CommonMark 把源码里的 `\\` 转义为 `\`，因此 mdast 值层面 `a\nb` 与
    // `a\\nb` 完全相同 —— 两者都会换行。按"仅支持 \n"的决策接受该行为。
    const viaEscapedBackslash = text(`a${ESC}b`) // 等价于源码 a\\nb
    const tree = transform(para(viaEscapedBackslash))
    expect(tree.children![0].children).toEqual([text('a'), brk, text('b')])
  })

  it('handles a tree with no children', () => {
    const tree: Node = { type: 'root' }
    expect(() => transformBreakEscapes(tree)).not.toThrow()
  })
})
