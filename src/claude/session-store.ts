import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '../config/env.js'

/** Short bot identifier from token (last 6 chars) for session isolation. */
const BOT_ID = env.BOT_TOKEN.slice(-6)

const SESSION_FILE = join(process.cwd(), '.sessions.json')

function loadSessions(): Map<string, string> {
  try {
    const data = readFileSync(SESSION_FILE, 'utf-8')
    return new Map(Object.entries(JSON.parse(data)))
  } catch {
    return new Map()
  }
}

function saveSessions(): void {
  try {
    const obj = Object.fromEntries(sessions)
    writeFileSync(SESSION_FILE, JSON.stringify(obj, null, 2))
  } catch (err) {
    console.error('[session-store] failed to save:', err)
  }
}

const sessions = loadSessions()

function makeKey(projectPath: string): string {
  return `${BOT_ID}:${projectPath}`
}

export function getSessionId(projectPath: string): string | null {
  return sessions.get(makeKey(projectPath)) ?? null
}

export function setSessionId(projectPath: string, sessionId: string): void {
  sessions.set(makeKey(projectPath), sessionId)
  saveSessions()
}

export function clearSession(projectPath: string): boolean {
  const deleted = sessions.delete(makeKey(projectPath))
  if (deleted) saveSessions()
  return deleted
}

export function clearAllSessions(): void {
  sessions.clear()
  saveSessions()
}
