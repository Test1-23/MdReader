import { IpcMain } from 'electron'
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

interface ChatMessage {
  role: string
  content: string
}

interface ApiConfig {
  endpoint: string
  apiKey: string
  model: string
}

function convDir(): string {
  return join(app.getPath('userData'), 'mdreader', 'conversations')
}

async function ensureDir(dir: string) {
  try { await mkdir(dir, { recursive: true }) } catch { /* exists */ }
}

// ---- AI Chat ----

const activeStreams = new Map<string, AbortController>()

export function registerAiHandlers(ipcMain: IpcMain) {
  ipcMain.handle('ai:chat', async (_event, messages: ChatMessage[], config: ApiConfig) => {
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
  ipcMain.handle('ai:chatStream', async (event, requestId: string, messages: ChatMessage[], config: ApiConfig) => {
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
            if (delta) event.sender.send('ai:chat-chunk', { requestId, delta })
            if (reasoning) event.sender.send('ai:chat-reasoning', { requestId, delta: reasoning })
          } catch { /* skip partial lines */ }
        }
      }

      event.sender.send('ai:chat-done', { requestId })
    } catch (err) {
      if (!controller.signal.aborted) {
        event.sender.send('ai:chat-error', { requestId, message: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      activeStreams.delete(requestId)
    }
  })

  ipcMain.handle('ai:cancelStream', (_event, requestId: string) => {
    activeStreams.get(requestId)?.abort()
  })

  // ---- Conversation Persistence ----

  ipcMain.handle('ai:saveConversation', async (_event, id: string, data: unknown) => {
    const dir = convDir()
    await ensureDir(dir)
    await writeFile(join(dir, `${id}.json`), JSON.stringify(data, null, 2), 'utf-8')
  })

  ipcMain.handle('ai:loadConversation', async (_event, id: string) => {
    try {
      const raw = await readFile(join(convDir(), `${id}.json`), 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  })

  ipcMain.handle('ai:listConversations', async () => {
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

  ipcMain.handle('ai:deleteConversation', async (_event, id: string) => {
    try { await unlink(join(convDir(), `${id}.json`)) } catch { /* doesn't exist */ }
  })
}
