import { useCallback } from 'react'

/**
 * Hook to access Electron APIs safely.
 * Returns null for each function if running outside Electron.
 */
export function useElectronAPI() {
  const api = window.electronAPI

  const readFile = useCallback(async (filePath: string) => {
    if (!api) throw new Error('Not running in Electron')
    return api.readFile(filePath)
  }, [api])

  const readDir = useCallback(async (dirPath: string) => {
    if (!api) throw new Error('Not running in Electron')
    return api.readDir(dirPath)
  }, [api])

  const openFileDialog = useCallback(async () => {
    if (!api) throw new Error('Not running in Electron')
    return api.openFileDialog()
  }, [api])

  const openFolderDialog = useCallback(async () => {
    if (!api) throw new Error('Not running in Electron')
    return api.openFolderDialog()
  }, [api])

  return {
    isElectron: !!api,
    readFile,
    readDir,
    openFileDialog,
    openFolderDialog,
  }
}
