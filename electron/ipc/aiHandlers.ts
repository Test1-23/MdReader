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
