// 把 markdown 文本中字面两字符序列 `\n`（反斜杠 + n）渲染为换行（<br>）。
//
// 只遍历 text 节点 —— 代码块（code）、行内代码（inlineCode）、数学
// （inlineMath/math）、原始 HTML（html）都是其他节点类型，结构上天然排除，
// 无需正则或围栏跟踪。

interface MdastNode {
  type: string
  value?: string
  children?: MdastNode[]
}

// 两个字符：反斜杠 + n —— 不是换行符，勿"简化"为 '\n'
const ESCAPE = '\\n'

/** 就地改写树：含转义的 text 节点拆为 [text, break, text, break, …] */
export function transformBreakEscapes(tree: MdastNode): void {
  if (!tree.children) return
  const next: MdastNode[] = []
  for (const child of tree.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes(ESCAPE)) {
      const parts = child.value.split(ESCAPE)
      parts.forEach((part, i) => {
        if (i > 0) next.push({ type: 'break' })
        if (part) next.push({ type: 'text', value: part })
      })
    } else {
      // 递归进入 emphasis/strong/link/heading/tableCell/delete/listItem…
      transformBreakEscapes(child)
      next.push(child)
    }
  }
  tree.children = next
}

export default function remarkBreakEscapes() {
  return (tree: MdastNode) => transformBreakEscapes(tree)
}
