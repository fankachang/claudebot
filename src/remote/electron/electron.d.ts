/**
 * Minimal Electron type stubs for compilation.
 * Install `electron` package for full types: npm install -D electron
 */

declare module 'electron' {
  interface WebPreferences {
    preload?: string
    contextIsolation?: boolean
    nodeIntegration?: boolean
    sandbox?: boolean
  }

  interface BrowserWindowOptions {
    width?: number
    height?: number
    title?: string
    resizable?: boolean
    webPreferences?: WebPreferences
  }

  interface WebContents {
    send(channel: string, ...args: unknown[]): void
  }

  class BrowserWindow {
    constructor(options?: BrowserWindowOptions)
    webContents: WebContents
    loadFile(filePath: string): Promise<void>
    on(event: string, listener: (...args: unknown[]) => void): this
    isDestroyed(): boolean
  }

  interface IpcMainInvokeEvent {
    sender: WebContents
  }

  const ipcMain: {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void
  }

  const app: {
    whenReady(): Promise<void>
    on(event: string, listener: (...args: unknown[]) => void): void
    quit(): void
  }
}
