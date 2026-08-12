import { IpcMain, dialog } from 'electron'
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
}
