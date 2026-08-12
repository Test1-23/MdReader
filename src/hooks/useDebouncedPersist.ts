import { useCallback, useEffect, useRef } from 'react'
import { persistConversation } from '../components/AIChat/conversationPersistence'

/**
 * E18: debounced conversation persistence — rapid branch switches within 1s
 * save once, always with the latest value (no stale closures).
 */
export function useDebouncedPersist(): (c: Parameters<typeof persistConversation>[0]) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return useCallback((conv) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => persistConversation(conv), 1000)
  }, [])
}
