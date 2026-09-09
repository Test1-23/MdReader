import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { join } from 'path'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerDialogHandlers } from './ipc/dialogHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerAiHandlers, abortAllStreams } from './ipc/aiHandlers'
import { setMainWindowGetter } from './ipc/security'

let mainWindow: BrowserWindow | null = null

setMainWindowGetter(() => mainWindow)

// 窗口/任务栏图标 —— 打包后与 dev 使用同一相对路径（assets/** 已随 asar 打包）
const APP_ICON = join(__dirname, '../assets/icon.png')

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'MdReader',
    icon: APP_ICON,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 显式声明（Electron 20+ 默认即为 true）——渲染不可信 markdown，这是底线
      sandbox: true,
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
  // Windows 任务栏按 AppUserModelID 归组（与 electron-builder 的 appId 一致）
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mdreader.app')
  }
  // 权限请求一律拒绝（剪贴板读取走 navigator.clipboard 由渲染层自行处理，
  // 不依赖 Electron 权限）：markdown 内容不可信，不默认放行任何权限
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  registerIpcHandlers()
  createWindow()
})

// 主进程异常：至少留下日志与用户可见提示，而不是静默退出/挂起
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

app.on('web-contents-created', (_event, contents) => {
  // 渲染进程崩溃（如超大文档 OOM）：给出可见提示并提供重载入口
  contents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone:', details.reason)
    const win = BrowserWindow.fromWebContents(contents)
    if (win && !win.isDestroyed()) {
      void dialog.showMessageBox(win, {
        type: 'error',
        title: 'MdReader',
        message: '页面进程已崩溃',
        detail: `原因：${details.reason}。点击"重载"恢复窗口。`,
        buttons: ['重载', '关闭'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0 && !win.isDestroyed()) win.reload()
      })
    }
  })
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
