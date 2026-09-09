import { useCallback } from 'react'

/**
 * Electron API 的统一入口。
 *
 * 所有渲染层调用都走这里（而不是散落的 `window.electronAPI?.x?.()`）：
 * 一处处理"不在 Electron 中"的情况、一处维护类型。
 * 例外：src/utils 下的纯模块（conversationPersistence）与非组件环境无法使用
 * hook，仍直接访问 window.electronAPI（同样带守卫）。
 */
export function useElectronAPI() {
  const api = window.electronAPI

  const require = (): NonNullable<typeof api> => {
    if (!api) throw new Error('Not running in Electron')
    return api
  }

  // ---- 文件 ----
  const readFile = useCallback(async (filePath: string) => require().readFile(filePath), [api])
  const writeFile = useCallback(
    async (args: Parameters<NonNullable<typeof api>['writeFile']>[0]) => require().writeFile(args),
    [api],
  )
  const readDir = useCallback(async (dirPath: string) => require().readDir(dirPath), [api])

  // ---- 对话框 ----
  const openFileDialog = useCallback(async () => require().openFileDialog(), [api])
  const openFolderDialog = useCallback(async () => require().openFolderDialog(), [api])
  const saveFileDialog = useCallback(async (suggestedName: string) => require().saveFileDialog(suggestedName), [api])

  // ---- 设置 ----
  const loadApiConfig = useCallback(async () => require().loadApiConfig(), [api])
  const saveApiConfig = useCallback(
    async (config: Parameters<NonNullable<typeof api>['saveApiConfig']>[0]) => require().saveApiConfig(config),
    [api],
  )
  const clearApiConfig = useCallback(async () => require().clearApiConfig(), [api])

  // ---- 会话持久化 ----
  const saveConversation = useCallback(
    async (id: string, data: unknown) => require().saveConversation(id, data),
    [api],
  )
  const loadConversation = useCallback(async (id: string) => require().loadConversation(id), [api])
  const listConversations = useCallback(async () => require().listConversations(), [api])
  const deleteConversation = useCallback(async (id: string) => require().deleteConversation(id), [api])

  return {
    isElectron: !!api,
    // 文件
    readFile,
    writeFile,
    readDir,
    // 对话框
    openFileDialog,
    openFolderDialog,
    saveFileDialog,
    // 设置
    loadApiConfig,
    saveApiConfig,
    clearApiConfig,
    // 会话
    saveConversation,
    loadConversation,
    listConversations,
    deleteConversation,
  }
}
