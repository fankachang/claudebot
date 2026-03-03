import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROMPT_PATH = resolve('data/system-prompt.md')
const CTX_SPEC_PATH = resolve('data/ctx-spec.md')

let basePrompt: string | null = null
let ctxSpec: string | null = null

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

function loadCtxSpec(): string {
  if (ctxSpec !== null) return ctxSpec
  try {
    ctxSpec = readFileSync(CTX_SPEC_PATH, 'utf-8').trim()
  } catch {
    ctxSpec = ''
  }
  return ctxSpec
}

export function getSystemPrompt(): string {
  const base = loadBasePrompt()
  const ctx = loadCtxSpec()

  const parts: string[] = [base]

  if (registeredCommands.length > 0) {
    const commandLines = registeredCommands
      .map((c) => `- /${c.command} — ${c.description}`)
      .join('\n')
    parts.push(`## Available Bot Commands (for reference)\n${commandLines}`)
  }

  if (ctx) {
    parts.push(ctx)
  }

  return parts.join('\n\n')
}

/** Reload both system prompt and CTX spec from disk. */
export function reloadSystemPrompt(): string {
  basePrompt = null
  ctxSpec = null
  return getSystemPrompt()
}

/** Reload only the CTX spec from disk. */
export function reloadCtxSpec(): string {
  ctxSpec = null
  return loadCtxSpec()
}
