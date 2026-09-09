// 内联 HTML 的安全边界。
//
// 应用允许 markdown 里的原始 HTML 渲染（`<br>`、`<span style>`、`<div>`、表格…），
// 但必须剥掉三类东西：
//   1. 可执行元素（script/iframe/object/embed）—— dev 环境的 CSP 允许内联脚本，
//      生产环境虽被 CSP 挡住，也不应把它们留在 DOM 里
//   2. 全局副作用元素（style/link/meta/base）—— 能改写整个应用的样式、
//      注入跳转、劫持相对链接
//   3. 事件处理属性（on*）与 srcdoc —— CSP 之外的执行面
//
// 其余标签与属性（含行内 style= 与 class=）原样保留。

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
}

// GitHub 风格的危险标签 + 全局副作用标签
const DROP_TAGS = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'style', 'link', 'meta', 'base', 'form',
])

const DROP_ATTRS = new Set(['srcdoc'])

function isEventHandler(name: string): boolean {
  return /^on/i.test(name)
}

/** 就地清理：返回被保留的子节点数组 */
export function sanitizeHtmlTree(node: HastNode): void {
  if (!node.children) return
  const kept: HastNode[] = []
  for (const child of node.children) {
    if (child.type === 'element' && child.tagName && DROP_TAGS.has(child.tagName.toLowerCase())) {
      continue // 连同内容一起丢弃
    }
    if (child.type === 'element' && child.properties) {
      const properties: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(child.properties)) {
        if (isEventHandler(key) || DROP_ATTRS.has(key.toLowerCase())) continue
        properties[key] = value
      }
      child.properties = properties
    }
    sanitizeHtmlTree(child)
    kept.push(child)
  }
  node.children = kept
}

export default function rehypeSafeHtml() {
  return (tree: HastNode) => sanitizeHtmlTree(tree)
}
