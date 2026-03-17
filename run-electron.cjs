/** Bypass npx — spawn electron.exe directly. Usage: node run-electron.cjs [args...] */
const { spawn } = require('child_process')
const { join, resolve } = require('path')
const { readFileSync, existsSync, openSync, mkdirSync } = require('fs')

const root = resolve(__dirname)
const pathFile = join(root, 'node_modules', 'electron', 'path.txt')

if (!existsSync(pathFile)) {
  console.error('ERROR: electron not installed. Run: npm install')
  process.exit(1)
}

const relPath = readFileSync(pathFile, 'utf-8').trim()
const bin = join(root, 'node_modules', 'electron', 'dist', relPath)
const args = process.argv.slice(2)

console.log(`Electron: ${bin}`)
console.log(`Args: ${args.join(' ')}`)

// Redirect stderr to log file (Electron GUI on Windows has no console)
const dataDir = join(root, 'data')
mkdirSync(dataDir, { recursive: true })
const logFd = openSync(join(dataDir, 'electron-launch.log'), 'w')

const child = spawn(bin, args, {
  cwd: root,
  detached: true,
  stdio: ['ignore', 'ignore', logFd],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
})

child.on('error', (err) => {
  console.error(`ERROR: ${err.message}`)
  process.exit(1)
})

// Wait 3s — if electron exits early, it's an error
let exitedEarly = false
child.on('exit', (code) => {
  if (code && code !== 0) {
    exitedEarly = true
    console.error(`Electron exited with code ${code} — check data/electron-launch.log`)
    process.exit(1)
  }
})

setTimeout(() => {
  if (!exitedEarly) {
    child.unref()
    console.log(`OK — Electron running (pid ${child.pid})`)
    console.log(`Log: data/electron-launch.log + data/electron-debug.log`)
    process.exit(0)
  }
}, 3000)
