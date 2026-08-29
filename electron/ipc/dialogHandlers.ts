import { IpcMain, app, dialog } from 'electron'
import { basename, join } from 'path'
import { IPC_CHANNELS } from './channels'
import { assertTrustedSender, getMainWindow } from './security'
import { authorizePath } from './fileHandlers'

export function registerDialogHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async (event) => {
    assertTrustedSender(event)
    const win = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Open Markdown File',
      filters: [
        { name: 'Markdown Files', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    // S6: the user explicitly picked this file — authorize reading it.
    const path = result.filePaths[0]
    authorizePath(path)
    return path
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async (event) => {
    assertTrustedSender(event)
    const win = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Open Folder',
      properties: ['openDirectory'],
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    // S6: every file under the picked folder becomes readable.
    const path = result.filePaths[0]
    authorizePath(path)
    return path
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_SAVE_FILE, async (event, suggestedName: unknown) => {
    assertTrustedSender(event)
    // F6: 建议名来自渲染层，不可信 —— basename + 非法字符替换 + 目录穿越拒绝
    const raw = basename(String(suggestedName ?? '')).replace(/[\\/:*?"<>|]/g, '_')
    const safeName = raw && !raw.includes('..') && raw !== '.' ? raw : 'import.md'
    const win = getMainWindow()
    const options: Electron.SaveDialogOptions = {
      title: 'Import as Markdown',
      defaultPath: join(app.getPath('documents'), safeName),
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)

    if (result.canceled || !result.filePath) {
      return null
    }

    // S6: 用户显式选中的目标文件自动授权（写入与随后的读取都需要）
    authorizePath(result.filePath)
    return result.filePath
  })
}
