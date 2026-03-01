/**
 * Electron preload script (CJS) — bridges main ↔ renderer via contextBridge.
 *
 * Plain JS to avoid ESM/CJS compilation issues with Electron's sandbox.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  connect: (relayUrl, code, baseDir) =>
    ipcRenderer.invoke('connect', relayUrl, code, baseDir),

  disconnect: () =>
    ipcRenderer.invoke('disconnect'),

  onLog: (callback) => {
    const handler = (_event, message) => callback(message)
    ipcRenderer.on('log', handler)
    return () => ipcRenderer.removeListener('log', handler)
  },

  onStatus: (callback) => {
    const handler = (_event, status) => callback(status)
    ipcRenderer.on('status', handler)
    return () => ipcRenderer.removeListener('status', handler)
  },
})
