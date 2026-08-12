import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'

let mainWindowGetter: (() => BrowserWindow | null) | null = null

export function setMainWindowGetter(getter: () => BrowserWindow | null): void {
  mainWindowGetter = getter
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindowGetter?.() ?? null
}

// Reject IPC calls that do not come from our own main window. The app never
// loads remote content today, but markdown is rendered as raw HTML — this is
// cheap defense in depth if that ever becomes an XSS vector.
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed() || event.sender !== win.webContents) {
    throw new Error('IPC rejected: untrusted sender')
  }
}
