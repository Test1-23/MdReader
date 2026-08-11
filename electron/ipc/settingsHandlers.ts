import { IpcMain, safeStorage } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

interface ApiConfig {
  endpoint: string
  apiKey: string
  model: string
}

const CONFIG_FILENAME = 'api-config.json'

function configPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'mdreader', CONFIG_FILENAME)
}

async function ensureDir(dir: string) {
  try { await mkdir(dir, { recursive: true }) } catch { /* exists */ }
}

export function registerSettingsHandlers(ipcMain: IpcMain) {
  ipcMain.handle('settings:saveApiConfig', async (_event, config: ApiConfig) => {
    const dir = join(app.getPath('userData'), 'mdreader')
    await ensureDir(dir)

    // Encrypt the API key
    const encrypted = safeStorage.encryptString(config.apiKey)
    const data = {
      endpoint: config.endpoint,
      apiKey: encrypted.toString('base64'),
      model: config.model,
    }
    await writeFile(configPath(), JSON.stringify(data, null, 2), 'utf-8')
  })

  ipcMain.handle('settings:loadApiConfig', async (): Promise<ApiConfig | null> => {
    try {
      const raw = await readFile(configPath(), 'utf-8')
      const data = JSON.parse(raw)
      const decrypted = safeStorage.decryptString(Buffer.from(data.apiKey, 'base64'))
      return {
        endpoint: data.endpoint || '',
        apiKey: decrypted,
        model: data.model || '',
      }
    } catch {
      // Config file doesn't exist or can't be read
      return null
    }
  })

  ipcMain.handle('settings:clearApiConfig', async () => {
    try {
      const path = configPath()
      const { unlink } = await import('fs/promises')
      await unlink(path)
    } catch { /* doesn't exist */ }
  })
}
