// 解析计数探针 —— 仅用于冒烟测试的确定性断言（"某交互不应触发重新解析"）。
// 计数始终递增（开销可忽略）；只有 URL 带 ?probe=1 时才挂到 window，
// 保证发布构建的全局命名空间干净。

let count = 0

const PROBE_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('probe')

/** 每次渲染 markdown 解析组件时调用（一次渲染 = 一次完整解析） */
export function bumpParseCount(): void {
  count++
  if (PROBE_ENABLED) {
    ;(window as unknown as Record<string, number>).__mdParseCount = count
  }
}

/** 当前进程内的解析次数（测试用） */
export function readParseCount(): number {
  return count
}
