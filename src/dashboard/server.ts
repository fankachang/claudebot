import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import { scanProjects } from '../config/projects.js'
import { getLockHolder } from '../claude/file-lock.js'
import { acquireCommandLock, releaseCommandLock } from './command-lock.js'
import type { BotHeartbeat, DashboardCommand } from './types.js'

const HEARTBEAT_DIR = join(process.cwd(), 'data', 'heartbeat')
const COMMANDS_FILE = join(process.cwd(), 'data', 'commands.json')
const WEB_DIST = join(process.cwd(), 'src', 'dashboard', 'web', 'dist')
const HEARTBEAT_STALE_MS = 10_000
const MAX_COMMANDS_KEPT = 200

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

// --- Validation schemas ---

const CreateCommandSchema = z.object({
  targetBot: z.string().nullable().optional().default(null),
  type: z.enum(['prompt', 'cancel', 'select_project', 'switch_model', 'new_session']),
  payload: z.record(z.unknown()).default({}),
})

// --- Heartbeat aggregation ---

async function readAllHeartbeats(): Promise<readonly BotHeartbeat[]> {
  try {
    const files = await readdir(HEARTBEAT_DIR)
    const jsons = files.filter((f) => f.endsWith('.json'))
    const results: BotHeartbeat[] = []

    for (const file of jsons) {
      try {
        const raw = await readFile(join(HEARTBEAT_DIR, file), 'utf-8')
        const hb = JSON.parse(raw) as BotHeartbeat
        results.push(hb)
      } catch {
        // skip malformed files
      }
    }

    return results
  } catch {
    return []
  }
}

function isStaleHeartbeat(hb: BotHeartbeat): boolean {
  return Date.now() - hb.updatedAt > HEARTBEAT_STALE_MS
}

// --- Command store (file-based with locking) ---

async function readCommands(): Promise<DashboardCommand[]> {
  try {
    const raw = await readFile(COMMANDS_FILE, 'utf-8')
    return JSON.parse(raw) as DashboardCommand[]
  } catch {
    return []
  }
}

async function writeCommands(commands: readonly DashboardCommand[]): Promise<void> {
  await mkdir(join(process.cwd(), 'data'), { recursive: true })
  const pruned = commands.length > MAX_COMMANDS_KEPT
    ? commands.slice(-MAX_COMMANDS_KEPT)
    : commands
  await writeFile(COMMANDS_FILE, JSON.stringify(pruned, null, 2), 'utf-8')
}

async function addCommand(cmd: DashboardCommand): Promise<void> {
  const locked = await acquireCommandLock('dashboard-server')
  if (!locked) {
    throw new Error('Could not acquire command lock')
  }
  try {
    const commands = await readCommands()
    await writeCommands([...commands, cmd])
  } finally {
    await releaseCommandLock()
  }
}

// --- HTTP routing ---

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

function send404(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not Found')
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const MAX_BODY = 64 * 1024
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        req.destroy()
        reject(new Error('Body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`)
  const path = url.pathname

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // GET /api/status — aggregate all bot heartbeats
  if (path === '/api/status' && req.method === 'GET') {
    const heartbeats = await readAllHeartbeats()
    const bots = heartbeats.map((hb) => ({
      ...hb,
      online: !isStaleHeartbeat(hb),
    }))
    sendJson(res, { bots, timestamp: Date.now() })
    return
  }

  // GET /api/projects — scan projects + lock status
  if (path === '/api/projects' && req.method === 'GET') {
    const projects = scanProjects()
    const projectsWithLock = await Promise.all(
      projects.map(async (p) => {
        const lockHolder = await getLockHolder(p.path)
        return { ...p, lockHolder }
      })
    )
    sendJson(res, { projects: projectsWithLock })
    return
  }

  // POST /api/commands — create a new command
  if (path === '/api/commands' && req.method === 'POST') {
    try {
      const raw = JSON.parse(await readBody(req))
      const validated = CreateCommandSchema.parse(raw)
      const cmd: DashboardCommand = {
        id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        targetBot: validated.targetBot ?? null,
        type: validated.type,
        payload: validated.payload,
        createdAt: Date.now(),
        status: 'pending',
        claimedBy: null,
      }
      await addCommand(cmd)
      sendJson(res, { command: cmd }, 201)
    } catch (err) {
      const message = err instanceof z.ZodError
        ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        : 'Invalid request body'
      sendJson(res, { error: message }, 400)
    }
    return
  }

  // GET /api/commands/:id — query command status
  const cmdMatch = path.match(/^\/api\/commands\/(.+)$/)
  if (cmdMatch && req.method === 'GET') {
    const commands = await readCommands()
    const cmd = commands.find((c) => c.id === cmdMatch[1])
    if (cmd) {
      sendJson(res, { command: cmd })
    } else {
      sendJson(res, { error: 'Command not found' }, 404)
    }
    return
  }

  // GET /api/commands — list recent commands
  if (path === '/api/commands' && req.method === 'GET') {
    const commands = await readCommands()
    const recent = commands.slice(-50)
    sendJson(res, { commands: recent })
    return
  }

  send404(res)
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  let filePath = join(WEB_DIST, req.url === '/' ? 'index.html' : req.url ?? '')

  try {
    const fileStat = await stat(filePath)
    if (fileStat.isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
  } catch {
    // SPA fallback: serve index.html for non-file paths
    filePath = join(WEB_DIST, 'index.html')
  }

  try {
    const content = await readFile(filePath)
    const ext = extname(filePath)
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    })
    res.end(content)
    return true
  } catch {
    return false
  }
}

// --- WebSocket relay ---

function startWsRelay(wss: WebSocketServer): void {
  const clients = new Set<WebSocket>()

  wss.on('connection', (ws) => {
    clients.add(ws)
    ws.on('close', () => clients.delete(ws))
    ws.on('error', (err) => {
      console.error('[dashboard] WebSocket error:', err)
      clients.delete(ws)
    })
  })

  // Broadcast heartbeats every 2s
  setInterval(async () => {
    if (clients.size === 0) return
    try {
      const heartbeats = await readAllHeartbeats()
      const payload = JSON.stringify({
        type: 'heartbeat',
        bots: heartbeats.map((hb) => ({
          ...hb,
          online: !isStaleHeartbeat(hb),
        })),
        timestamp: Date.now(),
      })

      for (const client of clients) {
        if (client.readyState === 1) {
          client.send(payload)
        }
      }
    } catch (err) {
      console.error('[dashboard] Heartbeat broadcast error:', err)
    }
  }, 2_000)
}

// --- Main entry ---

export function startDashboardServer(port: number): void {
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/'

    // API routes
    if (url.startsWith('/api/')) {
      await handleApi(req, res)
      return
    }

    // Static files
    const served = await serveStatic(req, res)
    if (!served) {
      send404(res)
    }
  })

  const wss = new WebSocketServer({ server })
  startWsRelay(wss)

  server.listen(port, () => {
    console.log(`[dashboard] Server running at http://localhost:${port}`)
  })
}

