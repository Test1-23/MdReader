import { IpcMain, safeStorage } from 'electron'
import { readFile, writeFile, unlink } from 'fs/promises'
import type { ApiConfig, PublicApiConfig } from '../../src/types/ipc'
import { IPC_CHANNELS } from './channels'
import { configPath, ensureDir, userDataDir } from './paths'
import { assertTrustedSender } from './security'

interface StoredConfig {
  endpoint?: string
  model?: string
  apiKey?: string
  encrypted?: boolean
}

async function readStoredConfig(): Promise<StoredConfig | null> {
  try {
    const raw = await readFile(configPath(), 'utf-8')
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? (data as StoredConfig) : null
  } catch {
    return null
  }
}

// S1: the API key never enters the renderer — the main process reads it from
// disk and attaches it to outbound requests itself.
export async function getApiKey(): Promise<string | null> {
  const data = await readStoredConfig()
  if (!data?.apiKey) return null
  if (data.encrypted === false) return data.apiKey
  try {
    return safeStorage.decryptString(Buffer.from(data.apiKey, 'base64'))
  } catch (err) {
    // B11: OS keyring changed (system reinstall / account migration) — the key is
    // unrecoverable. Treat as absent instead of crashing.
    console.error('[settings] API key decrypt failed:', err)
    return null
  }
}

export function registerSettingsHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (event, config: ApiConfig) => {
    assertTrustedSender(event)
    await ensureDir(userDataDir())

    if (!config.apiKey) {
      // S1: the renderer can never read the key back, so an empty apiKey means
      // "keep the stored key" — merge endpoint/model into the existing file.
      const prev = await readStoredConfig()
      if (prev?.apiKey) {
        const merged = { ...prev, endpoint: config.endpoint, model: config.model }
        await writeFile(configPath(), JSON.stringify(merged, null, 2), 'utf-8')
        return
      }
      // fall through — nothing stored yet, save with an empty key
    }

    // B11: safeStorage needs an OS keyring/DPAPI — degrade to plaintext with a
    // marker instead of throwing and silently failing to save.
    let apiKey: string
    let encrypted = true
    if (safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.encryptString(config.apiKey).toString('base64')
    } else {
      console.warn('[settings] safeStorage unavailable — storing API key in plaintext')
      apiKey = config.apiKey
      encrypted = false
    }
    const data = { endpoint: config.endpoint, apiKey, model: config.model, encrypted }
    await writeFile(configPath(), JSON.stringify(data, null, 2), 'utf-8')
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_LOAD, async (event): Promise<PublicApiConfig | null> => {
    assertTrustedSender(event)
    const data = await readStoredConfig()
    if (!data) return null
    let hasKey = false
    if (data.apiKey) {
      if (data.encrypted === false) {
        hasKey = true
      } else {
        try {
          safeStorage.decryptString(Buffer.from(data.apiKey, 'base64'))
          hasKey = true
        } catch {
          // B11: distinguish "no key" from "key present but unrecoverable" is not
          // exposed — the renderer only learns the key is unusable.
          hasKey = false
        }
      }
    }
    return { endpoint: data.endpoint || '', model: data.model || '', hasKey }
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_CLEAR, async (event) => {
    assertTrustedSender(event)
    try {
      await unlink(configPath())
    } catch { /* doesn't exist */ }
  })
}
