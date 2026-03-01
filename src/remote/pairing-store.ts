/**
 * In-memory pairing state for remote vibe-coding sessions.
 * A-side generates pairing codes; N-side connects with the code via relay.
 */

import { randomBytes } from 'node:crypto'
import { sessionKey } from '../bot/state.js'

const PAIRING_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface PairingSession {
  readonly code: string
  readonly chatId: number
  readonly threadId: number | undefined
  readonly createdAt: number
  readonly label: string
  readonly connected: boolean
}

/** Key: sessionKey(chatId, threadId) → PairingSession */
const pairings = new Map<string, PairingSession>()

/** Reverse lookup: code → sessionKey */
const codeIndex = new Map<string, string>()

function isExpired(session: PairingSession): boolean {
  // Connected sessions don't expire
  if (session.connected) return false
  return Date.now() - session.createdAt > PAIRING_TTL_MS
}

function purgeExpired(key: string, session: PairingSession): boolean {
  if (isExpired(session)) {
    codeIndex.delete(session.code)
    pairings.delete(key)
    return true
  }
  return false
}

export function createPairingCode(
  chatId: number,
  threadId: number | undefined,
): string {
  const key = sessionKey(chatId, threadId)

  // Remove previous pairing for this chat if any
  const prev = pairings.get(key)
  if (prev) {
    codeIndex.delete(prev.code)
    pairings.delete(key)
  }

  // 8-char alphanumeric code (~2^47 possibilities vs 6-digit ~900k)
  const code = randomBytes(5).toString('base64url').slice(0, 8).toUpperCase()
  const session: PairingSession = {
    code,
    chatId,
    threadId,
    createdAt: Date.now(),
    label: '',
    connected: false,
  }

  pairings.set(key, session)
  codeIndex.set(code, key)
  return code
}

export function getPairing(
  chatId: number,
  threadId: number | undefined,
): PairingSession | null {
  const key = sessionKey(chatId, threadId)
  const session = pairings.get(key)
  if (!session) return null
  if (purgeExpired(key, session)) return null
  return session
}

export function findByCode(code: string): PairingSession | null {
  const key = codeIndex.get(code)
  if (!key) return null
  const session = pairings.get(key)
  if (!session) return null
  if (purgeExpired(key, session)) return null
  return session
}

export function markConnected(code: string, label: string): boolean {
  const key = codeIndex.get(code)
  if (!key) return false
  const session = pairings.get(key)
  if (!session) return false
  pairings.set(key, { ...session, connected: true, label })
  return true
}

export function markDisconnected(code: string): void {
  const key = codeIndex.get(code)
  if (!key) return
  const session = pairings.get(key)
  if (!session) return
  pairings.set(key, { ...session, connected: false })
}

export function removePairing(
  chatId: number,
  threadId: number | undefined,
): boolean {
  const key = sessionKey(chatId, threadId)
  const session = pairings.get(key)
  if (!session) return false
  codeIndex.delete(session.code)
  pairings.delete(key)
  return true
}

export function getCodeForChat(
  chatId: number,
  threadId: number | undefined,
): string | null {
  const session = pairings.get(sessionKey(chatId, threadId))
  return session?.code ?? null
}
