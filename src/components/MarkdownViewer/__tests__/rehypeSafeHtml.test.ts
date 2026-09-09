import { describe, it, expect } from 'vitest'
import { sanitizeHtmlTree } from '../rehypeSafeHtml'

interface Node {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: Node[]
  value?: string
}

const el = (tagName: string, properties: Record<string, unknown> = {}, children: Node[] = []): Node =>
  ({ type: 'element', tagName, properties, children })
const text = (value: string): Node => ({ type: 'text', value })
const root = (...children: Node[]): Node => ({ type: 'root', children })

describe('sanitizeHtmlTree', () => {
  it('drops executable elements together with their content', () => {
    const tree = root(
      el('p', {}, [text('before')]),
      el('script', {}, [text('alert(1)')]),
      el('iframe', { src: 'https://evil' }),
      el('object', { data: 'x' }),
      el('embed', { src: 'x' }),
      el('p', {}, [text('after')]),
    )
    sanitizeHtmlTree(tree)
    expect(tree.children!.map((c) => c.tagName ?? c.type)).toEqual(['p', 'p'])
    expect(JSON.stringify(tree)).not.toContain('alert')
  })

  it('drops globally-scoped elements (style/link/meta/base/form)', () => {
    const tree = root(
      el('style', {}, [text('body{display:none}')]),
      el('link', { rel: 'stylesheet', href: 'https://evil/x.css' }),
      el('meta', { httpEquiv: 'refresh', content: '0;url=https://evil' }),
      el('base', { href: 'https://evil' }),
      el('form', { action: 'https://evil' }),
      el('div', {}, [text('kept')]),
    )
    sanitizeHtmlTree(tree)
    expect(tree.children!.map((c) => c.tagName)).toEqual(['div'])
  })

  it('strips event handler attributes but keeps style/class', () => {
    const tree = root(el('span', {
      style: 'color: red',
      className: ['x'],
      onError: 'alert(1)',
      onclick: 'alert(2)',
      onmouseover: 'alert(3)',
    }))
    sanitizeHtmlTree(tree)
    const props = tree.children![0].properties!
    expect(props).toEqual({ style: 'color: red', className: ['x'] })
  })

  it('strips srcdoc on any element', () => {
    const tree = root(el('div', { srcdoc: '<script>1</script>' }))
    sanitizeHtmlTree(tree)
    expect(tree.children![0].properties).toEqual({})
  })

  it('keeps ordinary formatting markup untouched', () => {
    const tree = root(
      el('br'),
      el('span', { style: 'color:red' }, [text('hi')]),
      el('div', { className: ['html-block'] }, [el('b', {}, [text('bold')])]),
      el('table', {}, [el('tr', {}, [el('td', {}, [text('cell')])])]),
    )
    const before = JSON.stringify(tree)
    sanitizeHtmlTree(tree)
    expect(JSON.stringify(tree)).toBe(before)
  })

  it('recurses into nested structures', () => {
    const tree = root(el('div', {}, [el('p', {}, [el('script', {}, [text('x')]), text('safe')])]))
    sanitizeHtmlTree(tree)
    expect(JSON.stringify(tree)).not.toContain('script')
    expect(JSON.stringify(tree)).toContain('safe')
  })

  it('handles nodes without children', () => {
    const tree: Node = { type: 'root' }
    expect(() => sanitizeHtmlTree(tree)).not.toThrow()
  })
})
