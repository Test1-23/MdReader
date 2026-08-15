import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Conversation } from '../utils/conversationTree'
import {
  getAssistantReply, replaceAssistantReply, addAssistantNode,
  appendAssistantContent, appendAssistantReasoning, buildMessages,
} from '../utils/conversationTree'
import type { ChatRequestConfig } from '../types/ipc'

export type ConvUpdater = Conversation | ((prev: Conversation) => Conversation)

interface UseAiStreamOptions {
  /** Functional-capable setter (R1): updates are atomic and guard on conversation id */
  setConv: (updater: ConvUpdater) => void
  /** Read config at stream start (endpoint/model/thinking may change between starts) */
  getConfig: () => ChatRequestConfig
  /** Full document context, read at stream start */
  getDocContent?: () => string | undefined
  /** Called with the final conversation when the user stops mid-stream */
  onStopped?: (finalConv: Conversation) => void
}

export interface AiStream {
  streaming: boolean
  /** Starts streaming an assistant reply for the given user node. Resolves with the final conversation. */
  start: (conv: Conversation, userNodeId: string) => Promise<Conversation>
  /** Cancels the active stream — the ai:chat-cancelled event resolves the promise and runs onStopped. */
  stop: () => void
}

interface PendingDeltas {
  content: string
  reasoning: string
}

/**
 * R1: owns the full streaming lifecycle — requestId filtering, event
 * subscription/unsubscription, per-frame delta batching (P2), terminal
 * (done/error/cancelled) resolution, and unmount teardown (B18).
 *
 * All state writes go through functional updates guarded by the stream's
 * conversation id (B2): chunks can never clobber a conversation the user
 * switched to mid-stream.
 */
export function useAiStream({ setConv, getConfig, getDocContent, onStopped }: UseAiStreamOptions): AiStream {
  const [streaming, setStreaming] = useState(false)
  const requestIdRef = useRef<string | null>(null)
  const reasoningStartRef = useRef(0)
  const setConvRef = useRef(setConv)
  const getConfigRef = useRef(getConfig)
  const getDocContentRef = useRef(getDocContent)
  const onStoppedRef = useRef(onStopped)
  const latestConvRef = useRef<Conversation | null>(null)
  const pendingRef = useRef<PendingDeltas>({ content: '', reasoning: '' })
  const scheduledRef = useRef(false)

  useEffect(() => { setConvRef.current = setConv }, [setConv])
  useEffect(() => { getConfigRef.current = getConfig }, [getConfig])
  useEffect(() => { getDocContentRef.current = getDocContent }, [getDocContent])
  useEffect(() => { onStoppedRef.current = onStopped }, [onStopped])

  const applyDeltas = useCallback((userNodeId: string, streamConvId: string) => {
    const { content, reasoning } = pendingRef.current
    pendingRef.current = { content: '', reasoning: '' }
    if (!content && !reasoning) return
    setConvRef.current((prev) => {
      if (prev.id !== streamConvId) return prev
      let next = prev
      if (content) next = appendAssistantContent(next, userNodeId, content)
      if (reasoning) next = appendAssistantReasoning(next, userNodeId, reasoning)
      latestConvRef.current = next
      return next
    })
  }, [])

  const start = useCallback(async (startConv: Conversation, userNodeId: string): Promise<Conversation> => {
    const api = window.electronAPI
    const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    requestIdRef.current = requestId
    reasoningStartRef.current = 0
    latestConvRef.current = startConv
    setStreaming(true)

    const streamConvId = startConv.id

    // 创建/复用空 assistant 节点（流式填充）
    let working = startConv
    const existing = getAssistantReply(startConv, userNodeId)
    working = existing ? replaceAssistantReply(working, userNodeId, '') : addAssistantNode(working, '', userNodeId)
    latestConvRef.current = working
    setConvRef.current(working)

    const userNode = working.nodes[userNodeId]
    if (!userNode) {
      // B20c-hardened add functions shouldn't let this happen; bail cleanly
      setStreaming(false)
      requestIdRef.current = null
      return working
    }
    const messages = buildMessages(
      working,
      userNodeId,
      userNode.content,
      userNode.selectedTexts,
      getDocContentRef.current?.(),
    )
    const config = getConfigRef.current()

    if (!api?.aiChatStream) {
      // Dev fallback (no Electron preload)
      const next = appendAssistantContent(working, userNodeId, `[DEV MODE] AI not available. You asked: "${userNode.content.slice(0, 100)}"`)
      latestConvRef.current = next
      setConvRef.current(next)
      setStreaming(false)
      requestIdRef.current = null
      return next
    }

    await new Promise<void>((resolve) => {
      let finished = false

      const offChunk = api.onAiChunk!(({ requestId: rid, delta }) => {
        if (rid !== requestId) return
        pendingRef.current.content += delta
        // P2: batch all deltas of one animation frame into a single state update
        if (!scheduledRef.current) {
          scheduledRef.current = true
          requestAnimationFrame(() => {
            scheduledRef.current = false
            if (requestIdRef.current !== requestId) return
            applyDeltas(userNodeId, streamConvId)
          })
        }
      })
      const offReasoning = api.onAiReasoning!(({ requestId: rid, delta }) => {
        if (rid !== requestId) return
        if (!reasoningStartRef.current) reasoningStartRef.current = Date.now()
        pendingRef.current.reasoning += delta
        if (!scheduledRef.current) {
          scheduledRef.current = true
          requestAnimationFrame(() => {
            scheduledRef.current = false
            if (requestIdRef.current !== requestId) return
            applyDeltas(userNodeId, streamConvId)
          })
        }
      })
      const cleanup = () => {
        offChunk(); offReasoning(); offDone(); offError(); offCancelled()
      }
      const finish = () => {
        if (finished) return
        finished = true
        cleanup()
        resolve()
      }
      const offDone = api.onAiDone!(({ requestId: rid }) => {
        if (rid !== requestId) return
        // Flush pending deltas before finalizing so no content is lost
        applyDeltas(userNodeId, streamConvId)
        // 写入深度思考耗时
        if (reasoningStartRef.current) {
          const duration = Date.now() - reasoningStartRef.current
          setConvRef.current((prev) => {
            if (prev.id !== streamConvId) return prev
            const reply = getAssistantReply(prev, userNodeId)
            if (!reply) return prev
            const nodes = { ...prev.nodes, [reply.id]: { ...reply, reasoningDuration: duration } }
            const next = { ...prev, nodes, updatedAt: Date.now() }
            latestConvRef.current = next
            return next
          })
        }
        finish()
      })
      const offError = api.onAiError!(({ requestId: rid, message }) => {
        if (rid !== requestId) return
        applyDeltas(userNodeId, streamConvId)
        setConvRef.current((prev) => {
          if (prev.id !== streamConvId) return prev
          const next = appendAssistantContent(prev, userNodeId, `\n\nError: ${message}`)
          latestConvRef.current = next
          return next
        })
        finish()
      })
      // B1: cancel is a terminal event — resolving here is what lets the UI
      // leave streaming mode after the user presses Stop.
      const offCancelled = api.onAiCancelled!(({ requestId: rid }) => {
        if (rid !== requestId) return
        applyDeltas(userNodeId, streamConvId)
        finish()
        onStoppedRef.current?.(latestConvRef.current!)
      })

      api.aiChatStream(requestId, messages, config)
    })

    setStreaming(false)
    requestIdRef.current = null
    return latestConvRef.current ?? startConv
  }, [applyDeltas])

  // B18: unmounting the panel tears the stream down — otherwise chunks keep
  // writing to the global conversation and the listeners leak forever.
  useEffect(() => () => {
    if (requestIdRef.current) {
      window.electronAPI?.cancelAiStream?.(requestIdRef.current)
    }
  }, [])

  const stop = useCallback(() => {
    if (requestIdRef.current) {
      window.electronAPI?.cancelAiStream?.(requestIdRef.current)
    }
  }, [])

  return useMemo(() => ({ streaming, start, stop }), [streaming, start, stop])
}
