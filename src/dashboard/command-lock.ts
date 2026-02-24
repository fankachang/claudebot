import { writeFile, unlink, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const LOCK_FILE = join(process.cwd(), 'data', 'commands.lock')
const STALE_MS = 10_000

interface LockInfo {
  readonly holder: string
  readonly pid: number
  readonly acquiredAt: number
}

export async function acquireCommandLock(holder: string): Promise<boolean> {
  try {
    const raw = await readFile(LOCK_FILE, 'utf-8')
    const info = JSON.parse(raw) as LockInfo
    if (Date.now() - info.acquiredAt < STALE_MS) {
      return false
    }
    // Stale lock, take over
  } catch {
    // No lock file, proceed
  }

  const info: LockInfo = { holder, pid: process.pid, acquiredAt: Date.now() }
  await writeFile(LOCK_FILE, JSON.stringify(info), 'utf-8')
  return true
}

export async function releaseCommandLock(): Promise<void> {
  try {
    await unlink(LOCK_FILE)
  } catch {
    // Already deleted
  }
}
