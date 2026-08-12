import { IpcMain, app } from 'electron'
import { readFile, writeFile, readdir, unlink, rename } from 'fs/promises'
import { join, resolve, isAbsolute, relative } from 'path'
import { randomBytes } from 'crypto'
import type { ChatMessage, ChatRequestConfig, ConversationSummary } from '../../src/types/ipc'
import { IPC_CHANNELS } from './channels'
import { convDir, ensureDir } from './paths'
import { getApiKey } from './settingsHandlers'
import { assertTrustedSender } from './security'

// ---- Active streams (cancellable) ----

const activeStreams = new Map<string, AbortController>()

export function abortAllStreams(): void {
  for (const controller of activeStreams.values()) controller.abort()
}

function registerStream(requestId: string, controller: AbortController): void {
  // B19m: a reused requestId must never leave two live streams under one key —
  // abort the old one before replacing so it cannot silently lose cancellability.
  const existing = activeStreams.get(requestId)
  if (existing) existing.abort()
  activeStreams.set(requestId, controller)
}

function unregisterStream(requestId: string, controller: AbortController): void {
  // B19m: only delete our own entry — an old stream's finally must not remove
  // a newer stream that was registered under the same id.
  if (activeStreams.get(requestId) === controller) activeStreams.delete(requestId)
}

// ---- Endpoint validation (S5) ----

function buildChatUrl(endpoint: string): string {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('Invalid API endpoint URL')
  }
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
    throw new Error('API endpoint must use https (http is only allowed for localhost)')
  }
  return `${endpoint.replace(/\/+$/, '')}/chat/completions`
}

async function requireApiKey(): Promise<string> {
  // S1: the key never enters the renderer — read it from disk here.
  const apiKey = await getApiKey()
  if (!apiKey) {
    throw new Error('API key not configured — open Settings (⚙️) and save your API key')
  }
  return apiKey
}

// Server-side stream protocol error (e.g. {"error": ...} payload or truncation)
class StreamProtocolError extends Error {}

// ---- Handlers ----

export function registerAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (event, messages: ChatMessage[], config: ChatRequestConfig) => {
    assertTrustedSender(event)
    const controller = new AbortController()
    // B19j: a hanging endpoint must not leave the invoke promise pending forever
    const timeout = setTimeout(() => controller.abort(), 120_000)
    try {
      const apiKey = await requireApiKey()
      const response = await fetch(buildChatUrl(config.endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`AI API error ${response.status}: ${errText.slice(0, 500)}`)
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || '(empty response)'
    } finally {
      clearTimeout(timeout)
    }
  })

  // 流式：SSE 解析，逐块通过 IPC 事件推送到渲染进程
  ipcMain.handle(IPC_CHANNELS.AI_CHAT_STREAM, async (event, requestId: unknown, messages: ChatMessage[], config: ChatRequestConfig) => {
    assertTrustedSender(event)
    if (typeof requestId !== 'string' || requestId.length === 0 || requestId.length > 128) {
      throw new Error('Invalid requestId')
    }

    const controller = new AbortController()
    registerStream(requestId, controller)

    // B19n: the window may be destroyed mid-stream — sending to a destroyed
    // webContents throws inside our own catch block and leaks an unhandled rejection.
    const send = (channel: string, data: unknown) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, data)
    }

    try {
      const apiKey = await requireApiKey()
      const response = await fetch(buildChatUrl(config.endpoint), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
          // DeepSeek-style thinking toggle — only attached when explicitly enabled.
          ...(config.thinking ? { chat_template_kwargs: { thinking: true } } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`AI API error ${response.status}: ${errText.slice(0, 500)}`)
      }
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let sawDone = false

      const processLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) return
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          sawDone = true
          return
        }
        let json: { error?: { message?: string }; choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }> }
        try {
          json = JSON.parse(data)
        } catch {
          console.warn(`[ai] skipping unparseable SSE line: ${data.slice(0, 120)}`)
          return
        }
        // B6: the server can emit {"error": {...}} mid-stream — surface it instead
        // of pretending the truncated reply completed normally.
        if (json.error) {
          throw new StreamProtocolError(json.error.message || JSON.stringify(json.error))
        }
        const delta = json.choices?.[0]?.delta?.content
        const reasoning = json.choices?.[0]?.delta?.reasoning_content
        if (delta) send(IPC_CHANNELS.AI_CHUNK, { requestId, delta })
        if (reasoning) send(IPC_CHANNELS.AI_REASONING, { requestId, delta: reasoning })
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) processLine(line)
      }
      // Flush residual bytes (a final line without a trailing newline)
      buffer += decoder.decode()
      if (buffer) processLine(buffer)

      // B6: EOF without [DONE] means the connection was cut — the renderer must
      // learn that instead of showing a truncated reply as a completed one.
      if (!sawDone) {
        throw new StreamProtocolError('Stream truncated: connection ended before [DONE]')
      }

      // B19o: abort may land after the read loop finished but before we send
      // done — the user cancelled, so don't deliver a fake completion.
      if (controller.signal.aborted) {
        send(IPC_CHANNELS.AI_CANCELLED, { requestId })
      } else {
        send(IPC_CHANNELS.AI_DONE, { requestId })
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // B1: the renderer's promise resolves only on a terminal event — without
        // this, pressing Stop leaves the UI stuck in streaming mode forever.
        send(IPC_CHANNELS.AI_CANCELLED, { requestId })
      } else {
        send(IPC_CHANNELS.AI_ERROR, { requestId, message: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      unregisterStream(requestId, controller)
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_CANCEL_STREAM, (event, requestId: unknown) => {
    assertTrustedSender(event)
    if (typeof requestId === 'string') {
      activeStreams.get(requestId)?.abort()
    }
  })

  // ---- Conversation Persistence ----

  ipcMain.handle(IPC_CHANNELS.AI_SAVE_CONVERSATION, async (event, id: unknown, data: unknown) => {
    assertTrustedSender(event)
    const safeId = sanitizeConversationId(id)
    await enqueueWrite(safeId, data)
  })

  ipcMain.handle(IPC_CHANNELS.AI_LOAD_CONVERSATION, async (event, id: unknown) => {
    assertTrustedSender(event)
    const safeId = sanitizeConversationId(id)
    try {
      const raw = await readFile(convFilePath(safeId), 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_LIST_CONVERSATIONS, async (event) => {
    assertTrustedSender(event)
    const dir = convDir()
    await ensureDir(dir)
    const { exists, list } = await readIndex()
    if (exists) {
      return list.sort((a, b) => b.updatedAt - a.updatedAt)
    }
    // P6: rebuild the index from files on first run (or after manual deletion)
    const rebuilt: ConversationSummary[] = []
    try {
      const files = await readdir(dir)
      for (const file of files) {
        if (!file.endsWith('.json') || file === INDEX_FILENAME) continue
        try {
          const raw = await readFile(join(dir, file), 'utf-8')
          const data = JSON.parse(raw)
          if (data && typeof data === 'object' && typeof data.id === 'string') {
            rebuilt.push({
              id: data.id,
              title: data.title || 'Untitled',
              updatedAt: data.updatedAt || 0,
            })
          }
        } catch { /* skip corrupt files */ }
      }
      await writeIndex(rebuilt)
    } catch (err) {
      console.error('[conversations] index rebuild failed:', err)
    }
    return rebuilt.sort((a, b) => b.updatedAt - a.updatedAt)
  })

  ipcMain.handle(IPC_CHANNELS.AI_DELETE_CONVERSATION, async (event, id: unknown) => {
    assertTrustedSender(event)
    const safeId = sanitizeConversationId(id)
    // Serialize with pending saves for this conversation so a queued save
    // cannot resurrect the file after deletion.
    const prev = writeQueues.get(safeId) ?? Promise.resolve()
    const next = trackWrite(prev.catch(() => {}).then(async () => {
      await unlink(convFilePath(safeId)).catch(() => { /* already gone */ })
      try {
        await chainIndex(async () => {
          const { list } = await readIndex()
          await writeIndex(list.filter((e) => e.id !== safeId))
        })
      } catch (err) {
        console.error('[conversations] index update failed:', err)
      }
    }))
    writeQueues.set(safeId, next)
    await next
  })
}

// ---- Conversation storage helpers ----

const CONV_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const INDEX_FILENAME = 'index.json'

// B12: conversation ids come from the renderer and are used as file names —
// validate the shape and resolve-path containment before touching the filesystem.
function sanitizeConversationId(id: unknown): string {
  if (typeof id !== 'string' || !CONV_ID_RE.test(id)) {
    throw new Error(`Invalid conversation id: ${String(id).slice(0, 60)}`)
  }
  return id
}

function convFilePath(id: string): string {
  const dir = convDir()
  const filePath = join(dir, `${id}.json`)
  const rel = relative(dir, filePath)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Conversation path escaped its directory')
  }
  return filePath
}

// B13: writes are serialized per conversation and made atomic via tmp+rename,
// so concurrent saves and mid-write crashes cannot corrupt or truncate files.
const writeQueues = new Map<string, Promise<void>>()
const pendingWrites = new Set<Promise<void>>()
let indexQueue: Promise<void> = Promise.resolve()

function trackWrite(p: Promise<void>): Promise<void> {
  pendingWrites.add(p)
  p.then(
    () => { pendingWrites.delete(p) },
    () => { pendingWrites.delete(p) },
  )
  return p
}

async function writeFileAtomic(target: string, data: string): Promise<void> {
  const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, data, 'utf-8')
  try {
    await rename(tmp, target)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

async function readIndex(): Promise<{ exists: boolean; list: ConversationSummary[] }> {
  try {
    const raw = await readFile(join(convDir(), INDEX_FILENAME), 'utf-8')
    const data = JSON.parse(raw)
    return { exists: true, list: Array.isArray(data) ? data : [] }
  } catch {
    return { exists: false, list: [] }
  }
}

async function writeIndex(list: ConversationSummary[]): Promise<void> {
  await ensureDir(convDir())
  await writeFileAtomic(join(convDir(), INDEX_FILENAME), JSON.stringify(list))
}

function chainIndex(fn: () => Promise<void>): Promise<void> {
  const next = indexQueue.then(fn)
  indexQueue = next.catch(() => {})
  return next
}

async function saveConversationData(id: string, data: unknown): Promise<void> {
  const dir = convDir()
  await ensureDir(dir)
  await writeFileAtomic(join(dir, `${id}.json`), JSON.stringify(data, null, 2))
  try {
    await chainIndex(async () => {
      const { list } = await readIndex()
      const entry: ConversationSummary = {
        id,
        title: (data as { title?: string })?.title || 'Untitled',
        updatedAt: (data as { updatedAt?: number })?.updatedAt || 0,
      }
      const idx = list.findIndex((e) => e.id === id)
      if (idx >= 0) list[idx] = entry
      else list.push(entry)
      await writeIndex(list)
    })
  } catch (err) {
    // The conversation itself is saved — a failed index update must not fail the save.
    console.error('[conversations] index update failed:', err)
  }
}

function enqueueWrite(id: string, data: unknown): Promise<void> {
  const prev = writeQueues.get(id) ?? Promise.resolve()
  const next = trackWrite(prev.catch(() => {}).then(() => saveConversationData(id, data)))
  writeQueues.set(id, next)
  return next
}

// B13: flush in-flight writes when the app quits — exiting mid-write would
// otherwise truncate conversation files.
let quitFlushDone = false
app.on('before-quit', (event) => {
  if (quitFlushDone || pendingWrites.size === 0) return
  event.preventDefault()
  quitFlushDone = true
  void Promise.allSettled([...pendingWrites, indexQueue]).then(() => app.quit())
})
