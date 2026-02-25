import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROMPT_PATH = resolve('data/system-prompt.md')

let basePrompt: string | null = null

interface CommandInfo {
  readonly command: string
  readonly description: string
}

let registeredCommands: readonly CommandInfo[] = []

/**
 * Register all available commands (core + plugins) so the system prompt
 * can dynamically tell Claude about them.
 */
export function setAvailableCommands(commands: readonly CommandInfo[]): void {
  registeredCommands = commands
}

function loadBasePrompt(): string {
  if (basePrompt !== null) return basePrompt
  try {
    basePrompt = readFileSync(PROMPT_PATH, 'utf-8').trim()
  } catch {
    basePrompt = ''
  }
  return basePrompt
}

export function getSystemPrompt(): string {
  const base = loadBasePrompt()

  if (registeredCommands.length === 0) return base

  const commandLines = registeredCommands
    .map((c) => `- /${c.command} — ${c.description}`)
    .join('\n')

  const commandSection = `\n\n## Available Bot Commands (for reference)\n${commandLines}`

  return base + commandSection
}

export function reloadSystemPrompt(): string {
  basePrompt = null
  return getSystemPrompt()
}
