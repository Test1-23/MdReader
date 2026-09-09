// 全局错误上报通道 —— 让 React 之外（全局事件、异步持久化、rAF 回调）的失败
// 也能到达 UI 的错误横幅。

export type ErrorReporter = (message: string) => void

let reporter: ErrorReporter | null = null

/** AppProvider 挂载时注册（转成 SET_ERROR dispatch） */
export function setErrorReporter(fn: ErrorReporter | null): void {
  reporter = fn
}

/** 上报一条用户可见的错误（未注册时退化为 console.error） */
export function reportError(message: string, detail?: unknown): void {
  if (detail !== undefined) console.error(`[reportError] ${message}`, detail)
  if (reporter) reporter(message)
  else console.error(`[reportError] ${message}`)
}
