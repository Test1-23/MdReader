import { IpcMain, BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS } from './channels'

export function registerDialogHandlers(ipcMain: IpcMain, mainWindow: BrowserWindow) {
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FILE, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Markdown File',
      filters: [
        { name: 'Markdown Files', extensions: ['md', 'markdown', 'mdown', 'mkd', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Folder',
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
}
