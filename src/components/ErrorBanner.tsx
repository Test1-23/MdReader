import { useEffect } from 'react'
import { useUIContext } from '../context/AppContext'

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
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slide-down">
      {/* B20i: dark-mode variants */}
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg shadow-lg text-sm max-w-lg">
        {/* Error icon */}
        <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>

        {/* Message */}
        <p className="text-red-800 dark:text-red-200 flex-1">{state.error}</p>

        {/* Dismiss button */}
        <button
          onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
          className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors font-bold px-1"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
