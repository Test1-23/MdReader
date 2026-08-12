import { IpcMain, app } from 'electron'
import { readFile, writeFile, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import type { ApiConfig, ChatMessage } from '../../src/types/ipc'
import { IPC_CHANNELS } from './channels'
import { convDir, ensureDir } from './paths'

// ---- AI Chat ----

const activeStreams = new Map<string, AbortController>()

export function registerAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_CHANNELS.AI_CHAT, async (_event, messages: ChatMessage[], config: ApiConfig) => {
    const url = `${config.endpoint.replace(/\/$/, '')}/chat/completions`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI API error ${response.status}: ${errText}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || '(empty response)'
  })

  // 流式：SSE 解析，逐块通过 IPC 事件推送到渲染进程
  ipcMain.handle(IPC_CHANNELS.AI_CHAT_STREAM, async (event, requestId: string, messages: ChatMessage[], config: ApiConfig) => {
    const controller = new AbortController()
    activeStreams.set(requestId, controller)

    try {
      const url = `${config.endpoint.replace(/\/$/, '')}/chat/completions`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`AI API error ${response.status}: ${errText}`)
      }
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content
            const reasoning = json.choices?.[0]?.delta?.reasoning_content
            if (delta) event.sender.send(IPC_CHANNELS.AI_CHUNK, { requestId, delta })
            if (reasoning) event.sender.send(IPC_CHANNELS.AI_REASONING, { requestId, delta: reasoning })
          } catch { /* skip partial lines */ }
        }
      }

      event.sender.send(IPC_CHANNELS.AI_DONE, { requestId })
    } catch (err) {
      if (!controller.signal.aborted) {
        event.sender.send(IPC_CHANNELS.AI_ERROR, { requestId, message: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      activeStreams.delete(requestId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_CANCEL_STREAM, (_event, requestId: string) => {
    activeStreams.get(requestId)?.abort()
  })

  // ---- Conversation Persistence ----

  ipcMain.handle(IPC_CHANNELS.AI_SAVE_CONVERSATION, async (_event, id: string, data: unknown) => {
    const dir = convDir()
    await ensureDir(dir)
    await writeFile(join(dir, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8')
  })

  ipcMain.handle(IPC_CHANNELS.AI_LOAD_CONVERSATION, async (_event, id: string) => {
    try {
      const raw = await readFile(join(convDir(), `${id}.json`), 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_LIST_CONVERSATIONS, async () => {
    try {
      const dir = convDir()
      await ensureDir(dir)
      const files = await readdir(dir)
      const result: Array<{ id: string; title: string; updatedAt: number }> = []
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        try {
          const raw = await readFile(join(dir, file), 'utf-8')
          const data = JSON.parse(raw)
          result.push({ id: data.id, title: data.title || 'Untitled', updatedAt: data.updatedAt || 0 })
        } catch { /* skip corrupt files */ }
      }
      return result.sort((a, b) => b.updatedAt - a.updatedAt)
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_DELETE_CONVERSATION, async (_event, id: string) => {
    try { await unlink(join(convDir(), `${id}.json`)) } catch { /* doesn't exist */ }
  })
}
