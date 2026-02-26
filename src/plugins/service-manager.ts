import type { Plugin } from '../types/plugin.js'

interface ServiceState {
  readonly plugin: Plugin
  running: boolean
}

interface FailureRecord {
  count: number
  firstFailAt: number
}

const FAILURE_WINDOW_MS = 60_000
const MAX_FAILURES = 3

const activeServices = new Map<string, ServiceState>()
const failures = new Map<string, FailureRecord>()

function shouldGiveUp(name: string): boolean {
  const record = failures.get(name)
  if (!record) return false
  if (Date.now() - record.firstFailAt > FAILURE_WINDOW_MS) {
    failures.delete(name)
    return false
  }
  return record.count >= MAX_FAILURES
}

function recordFailure(name: string): void {
  const existing = failures.get(name)
  const now = Date.now()
  if (!existing || now - existing.firstFailAt > FAILURE_WINDOW_MS) {
    failures.set(name, { count: 1, firstFailAt: now })
  } else {
    failures.set(name, { ...existing, count: existing.count + 1 })
  }
}

export async function startServices(plugins: readonly Plugin[]): Promise<void> {
  for (const plugin of plugins) {
    if (!plugin.service) continue
    if (activeServices.has(plugin.name)) continue
    if (shouldGiveUp(plugin.name)) {
      console.error(`[service-manager] Giving up on "${plugin.name}" after ${MAX_FAILURES} failures`)
      continue
    }

    try {
      await plugin.service.start()
      activeServices.set(plugin.name, { plugin, running: true })
      console.log(`[service-manager] Started service: ${plugin.name}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[service-manager] Failed to start "${plugin.name}": ${msg}`)
      recordFailure(plugin.name)
    }
  }
}

export async function stopServices(): Promise<void> {
  for (const [name, state] of activeServices) {
    if (!state.running || !state.plugin.service) continue
    try {
      await state.plugin.service.stop()
      console.log(`[service-manager] Stopped service: ${name}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[service-manager] Failed to stop "${name}": ${msg}`)
    }
  }
  activeServices.clear()
}

export function resetServiceState(): void {
  failures.clear()
}

export function getActiveServiceNames(): readonly string[] {
  return [...activeServices.keys()]
}
