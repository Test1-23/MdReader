import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerDialogHandlers } from './ipc/dialogHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerAiHandlers, abortAllStreams } from './ipc/aiHandlers'
import { setMainWindowGetter } from './ipc/security'

let mainWindow: BrowserWindow | null = null

setMainWindowGetter(() => mainWindow)

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'MdReader',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
  })
  mainWindow = win

  // S3: never navigate the window itself — external links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  win.on('closed', () => {
    // B19n: streams targeting a destroyed webContents would throw on send and
    // keep burning network — abort everything tied to this window.
    abortAllStreams()
    if (mainWindow === win) mainWindow = null
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }
}

// B19p: register IPC handlers exactly once. Previously this happened inside
// createWindow(), which crashes with "second handler registered" on macOS
// when the window is recreated via the activate event.
function registerIpcHandlers() {
  registerFileHandlers(ipcMain)
  registerDialogHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)
  registerAiHandlers(ipcMain)
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
