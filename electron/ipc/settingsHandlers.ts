import { IpcMain, safeStorage } from 'electron'
import { readFile, writeFile, unlink } from 'fs/promises'
import type { ApiConfig } from '../../src/types/ipc'
import { IPC_CHANNELS } from './channels'
import { configPath, ensureDir, userDataDir } from './paths'

export function registerSettingsHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, config: ApiConfig) => {
    await ensureDir(userDataDir())

    // Encrypt the API key
    const encrypted = safeStorage.encryptString(config.apiKey)
    const data = {
      endpoint: config.endpoint,
      apiKey: encrypted.toString('base64'),
      model: config.model,
    }
    await writeFile(configPath(), JSON.stringify(data, null, 2), 'utf-8')
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_LOAD, async (): Promise<ApiConfig | null> => {
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

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CLEAR, async () => {
    try {
      await unlink(configPath())
    } catch { /* doesn't exist */ }
  })
}
