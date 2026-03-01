/**
 * ClaudeBot Remote Agent — Electron main process.
 *
 * Connects to the ClaudeBot relay server and executes
 * filesystem / shell operations locally on behalf of Claude.
 * Communicates with the renderer via IPC for UI updates.
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { resolve } from 'node:path'
import { WebSocket } from 'ws'
import { createToolDispatcher, type ToolDispatcher } from '../tool-handlers.js'
import type {
  AgentRegister,
  ToolCallRequest,
  ToolCallResult,
  ToolCallError,
} from '../protocol.js'

// --- State ---

let mainWindow: BrowserWindow | null = null
let ws: WebSocket | null = null
let shouldReconnect = false
let toolDispatcher: ToolDispatcher | null = null

// --- Logging to renderer ---

function sendToRenderer(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

function log(message: string): void {
  sendToRenderer('log', message)
}

function setStatus(status: 'disconnected' | 'connecting' | 'connected'): void {
  sendToRenderer('status', status)
}

// --- WebSocket connection ---

function connectToRelay(relayUrl: string, code: string): void {
  setStatus('connecting')
  log(`Connecting to ${relayUrl}...`)

  const socket = new WebSocket(relayUrl)

  socket.on('open', () => {
    const msg: AgentRegister = { type: 'agent_register', code }
    socket.send(JSON.stringify(msg))
  })

  socket.on('message', async (raw) => {
    let msg: { type: string; [key: string]: unknown }
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'agent_registered') {
      ws = socket
      setStatus('connected')
      log('Connected and paired!')
      return
    }

    if (msg.type === 'error') {
      log(`Relay error: ${msg.error}`)
      socket.close()
      return
    }

    if (msg.type === 'tool_call' && toolDispatcher) {
      const req = msg as unknown as ToolCallRequest
      const toolShort = req.tool.replace('remote_', '')
      const argsPreview = Object.values(req.args).map(String).join(', ').slice(0, 80)
      log(`[tool] ${toolShort}(${argsPreview})`)

      try {
        const result = await toolDispatcher.dispatch(req.tool, req.args)
        const resp: ToolCallResult = { id: req.id, type: 'tool_result', result }
        socket.send(JSON.stringify(resp))
        log(`  done (${result.length} chars)`)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        const resp: ToolCallError = { id: req.id, type: 'tool_error', error }
        socket.send(JSON.stringify(resp))
        log(`  error: ${error}`)
      }
    }
  })

  socket.on('close', () => {
    ws = null
    setStatus('disconnected')
    if (shouldReconnect) {
      log('Disconnected. Reconnecting in 3s...')
      setTimeout(() => connectToRelay(relayUrl, code), 3_000)
    } else {
      log('Disconnected.')
    }
  })

  socket.on('error', (err) => {
    log(`Connection error: ${err.message}`)
  })
}

function disconnect(): void {
  shouldReconnect = false
  if (ws) {
    ws.close()
    ws = null
  }
  setStatus('disconnected')
  log('Disconnected by user.')
}

// --- IPC handlers ---

ipcMain.handle('connect', (_event, relayUrl: string, code: string, baseDir: string) => {
  const resolvedDir = resolve(baseDir || process.cwd())
  toolDispatcher = createToolDispatcher(resolvedDir)
  shouldReconnect = true
  log(`Working directory: ${resolvedDir}`)
  connectToRelay(relayUrl, code)
})

ipcMain.handle('disconnect', () => {
  disconnect()
})

// --- Window ---

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: 'ClaudeBot Remote Agent',
    resizable: true,
    webPreferences: {
      preload: resolve(process.cwd(), 'src', 'remote', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const htmlPath = resolve(process.cwd(), 'src', 'remote', 'electron', 'renderer', 'index.html')
  mainWindow.loadFile(htmlPath)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// --- App lifecycle ---

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  disconnect()
  app.quit()
})
