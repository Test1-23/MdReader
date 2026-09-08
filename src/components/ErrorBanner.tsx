import { useEffect } from 'react'
import { useUIContext } from '../context/AppContext'
import { AlertTriangle, X } from 'lucide-react'
import { IconButton } from './shared/IconButton'

export function ErrorBanner() {
  const { state, dispatch } = useUIContext()

  useEffect(() => {
    if (!state.error) return

    const timer = setTimeout(() => {
      dispatch({ type: 'SET_ERROR', payload: null })
    }, 8000)

    return () => clearTimeout(timer)
  }, [state.error, dispatch])

  if (!state.error) return null

  return (
    // 动画 keyframes 自带 translate(-50%) 居中 —— 不要加 -translate-x-1/2 类（transform 冲突）
    <div className="fixed top-4 left-1/2 z-50 animate-slide-down">
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl shadow-lg text-sm max-w-lg">
        {/* Error icon */}
        <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />

        {/* Message */}
        <p className="text-red-800 dark:text-red-200 flex-1">{state.error}</p>

        {/* Dismiss button */}
        <IconButton
          icon={X}
          title="Dismiss"
          size="md"
          onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
          className="flex-shrink-0 !text-red-400 hover:!text-red-600"
        />
      </div>
    </div>
  )
}
