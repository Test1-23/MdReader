import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 出错时上报（App 层用它弹 ErrorBanner） */
  onError?: (error: Error, info: ErrorInfo) => void
  /** 出错时的界面；默认是一个紧凑的内联提示 + 重试按钮 */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** 全屏样式（应用根节点用） */
  fullscreen?: boolean
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 渲染错误边界：任何子树抛错都不会让整个应用白屏。
 * 根节点用一个全屏兜底（含重载按钮），编辑器面板用内联兜底（其余面板继续可用）。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  private reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    const body = (
      <div className="flex flex-col items-center gap-3 text-center max-w-md px-6">
        <AlertTriangle size={28} className="text-amber-500" />
        <p className="text-sm font-semibold text-chrome-text">This panel hit an error</p>
        <p className="text-xs text-chrome-text-muted break-words">{error.message || String(error)}</p>
        <div className="flex gap-2">
          <button
            onClick={this.reset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <RotateCcw size={13} />
            Try again
          </button>
          {this.props.fullscreen && (
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-xs rounded-lg border border-chrome-border bg-chrome-surface hover:bg-chrome-hover text-chrome-text transition-colors"
            >
              Reload app
            </button>
          )}
        </div>
      </div>
    )

    if (this.props.fullscreen) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-chrome-surface">
          {body}
        </div>
      )
    }
    return <div className="h-full w-full flex items-center justify-center bg-chrome-surface">{body}</div>
  }
}
