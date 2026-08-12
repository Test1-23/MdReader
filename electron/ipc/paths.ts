import { app } from 'electron'
import { join } from 'path'
import { mkdir } from 'fs/promises'

// Central place for user-data paths, shared by aiHandlers and settingsHandlers.

export function userDataDir(): string {
  return join(app.getPath('userData'), 'mdreader')
}

export function convDir(): string {
  return join(userDataDir(), 'conversations')
}

export function configPath(): string {
  return join(userDataDir(), 'api-config.json')
}

export async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true })
  } catch (err) {
    // mkdir(recursive) does not throw when the dir exists — a throw means a real
    // permission/IO problem. Log it so the subsequent write failure has context.
    console.error(`ensureDir failed for ${dir}:`, err)
  }
}
