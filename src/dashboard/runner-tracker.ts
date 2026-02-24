import type { ActiveRunnerInfo } from './types.js'

/**
 * Lightweight in-memory tracker for active AI runner info.
 * Queue processor updates this; heartbeat writer reads it.
 * No existing code modified — bot.ts wires it up via hooks.
 */

const activeRunners = new Map<string, ActiveRunnerInfo>()

export function setActiveRunner(projectPath: string, info: ActiveRunnerInfo): void {
  activeRunners.set(projectPath, info)
}

export function updateRunnerTool(projectPath: string, toolName: string): void {
  const existing = activeRunners.get(projectPath)
  if (!existing) return
  activeRunners.set(projectPath, {
    ...existing,
    toolCount: existing.toolCount + 1,
    lastTool: toolName,
  })
}

export function removeActiveRunner(projectPath: string): void {
  activeRunners.delete(projectPath)
}

export function getActiveRunnerInfos(): readonly ActiveRunnerInfo[] {
  return [...activeRunners.values()]
}
