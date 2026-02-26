import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin } from '../types/plugin.js'
import type { BotContext } from '../types/context.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// --- Mutable registry (replaced on reload) ---

let pluginRegistry = new Map<string, (ctx: BotContext) => Promise<void>>()
let messageHandlers: ReadonlyArray<(ctx: BotContext) => Promise<boolean>> = []
let callbackHandlers: ReadonlyArray<(ctx: BotContext, data: string) => Promise<boolean>> = []
let loadedPlugins: readonly Plugin[] = []
let reloading = false

// Raw module references keyed by plugin name (for post-reload wiring like setReminderSendFn)
let pluginModules = new Map<string, Record<string, unknown>>()

// --- Public getters ---

export function getLoadedPlugins(): readonly Plugin[] {
  return loadedPlugins
}

export function getPluginModule(name: string): Record<string, unknown> | undefined {
  return pluginModules.get(name)
}

/**
 * Discover all plugin command names by actually importing every plugin dir.
 * Returns all command names (not just dir names) so multi-command plugins
 * like dice/ (dice, coin) are fully pre-registered.
 */
export async function discoverAllPluginCommandNames(): Promise<readonly string[]> {
  const pluginsDir = __dirname
  const names: string[] = []

  try {
    const entries = readdirSync(pluginsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // Check for both .js and .ts (tsx resolves .js → .ts at runtime)
      const jsPath = join(pluginsDir, entry.name, 'index.js')
      const tsPath = join(pluginsDir, entry.name, 'index.ts')
      if (!existsSync(jsPath) && !existsSync(tsPath)) continue
      const indexPath = jsPath  // tsx resolves .js → .ts automatically

      try {
        const mod = await import(pathToFileURL(indexPath).href)
        const plugin: Plugin | undefined = mod.default
        if (plugin?.commands) {
          for (const cmd of plugin.commands) {
            names.push(cmd.name)
          }
        }
      } catch {
        // Plugin failed to load during discovery — skip it
      }
    }
  } catch {
    // ignore if directory doesn't exist
  }

  return names
}

// --- Dispatch functions (called by bot.ts handlers) ---

export function isPluginCommand(name: string): boolean {
  return pluginRegistry.has(name)
}

export async function dispatchPluginCommand(name: string, ctx: BotContext): Promise<void> {
  const handler = pluginRegistry.get(name)
  if (handler) {
    await handler(ctx)
    return
  }
  await ctx.reply(`插件指令 /${name} 目前未啟用。`)
}

export async function dispatchPluginMessage(ctx: BotContext): Promise<boolean> {
  for (const handler of messageHandlers) {
    const handled = await handler(ctx)
    if (handled) return true
  }
  return false
}

export async function dispatchPluginCallback(ctx: BotContext, data: string): Promise<boolean> {
  for (const handler of callbackHandlers) {
    const handled = await handler(ctx, data)
    if (handled) return true
  }
  return false
}

// --- Internal: import a plugin with cache busting ---

interface ImportResult {
  readonly plugin: Plugin
  readonly mod: Record<string, unknown>
}

async function importPlugin(name: string, cacheBust: boolean): Promise<ImportResult | null> {
  const pluginDir = join(__dirname, name)

  if (!existsSync(pluginDir)) {
    console.warn(`[plugins] Plugin "${name}" not found at ${pluginDir}, skipping`)
    return null
  }

  try {
    const indexPath = join(pluginDir, 'index.js')
    const baseUrl = pathToFileURL(indexPath).href
    // Append timestamp only on reload to bust ESM cache
    const url = cacheBust ? `${baseUrl}?t=${Date.now()}` : baseUrl
    const mod = await import(url)
    const plugin: Plugin = mod.default

    if (!plugin || !plugin.name || !Array.isArray(plugin.commands)) {
      console.warn(`[plugins] Plugin "${name}" has invalid export, skipping`)
      return null
    }

    return { plugin, mod }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[plugins] Failed to load "${name}": ${msg}`)
    return null
  }
}

// --- Fill registry from loaded plugins ---

function buildRegistry(plugins: readonly Plugin[]): void {
  const newRegistry = new Map<string, (ctx: BotContext) => Promise<void>>()
  const newMessageHandlers: Array<(ctx: BotContext) => Promise<boolean>> = []
  const newCallbackHandlers: Array<(ctx: BotContext, data: string) => Promise<boolean>> = []

  for (const plugin of plugins) {
    for (const cmd of plugin.commands) {
      if (newRegistry.has(cmd.name)) {
        console.warn(`[plugins] Command "${cmd.name}" already registered, overwriting with ${plugin.name}`)
      }
      newRegistry.set(cmd.name, cmd.handler)
    }
    if (plugin.onMessage) {
      newMessageHandlers.push(plugin.onMessage)
    }
    if (plugin.onCallback) {
      newCallbackHandlers.push(plugin.onCallback)
    }
  }

  pluginRegistry = newRegistry
  messageHandlers = newMessageHandlers
  callbackHandlers = newCallbackHandlers
}

// --- Internal: shared load logic ---

async function importAndBuild(
  pluginNames: readonly string[],
  cacheBust: boolean,
  label: string,
): Promise<readonly Plugin[]> {
  if (pluginNames.length === 0) {
    loadedPlugins = []
    pluginModules = new Map()
    buildRegistry([])
    return loadedPlugins
  }

  const results: Plugin[] = []
  const modules = new Map<string, Record<string, unknown>>()

  for (const name of pluginNames) {
    const result = await importPlugin(name, cacheBust)
    if (result) {
      results.push(result.plugin)
      modules.set(result.plugin.name, result.mod)
      console.log(`[plugins] ${label}: ${result.plugin.name} (${result.plugin.commands.length} commands)`)
    }
  }

  loadedPlugins = results
  pluginModules = modules
  buildRegistry(results)
  return loadedPlugins
}

// --- Public: first-time load ---

export async function loadPlugins(pluginNames: readonly string[]): Promise<readonly Plugin[]> {
  return importAndBuild(pluginNames, false, 'Loaded')
}

// --- Public: hot reload (with mutex) ---

export async function reloadPlugins(pluginNames: readonly string[]): Promise<readonly Plugin[]> {
  if (reloading) {
    throw new Error('Reload already in progress')
  }
  reloading = true

  try {
    // Cleanup old plugins
    for (const plugin of loadedPlugins) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup()
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.warn(`[plugins] Cleanup failed for "${plugin.name}": ${msg}`)
        }
      }
    }

    return await importAndBuild(pluginNames, true, 'Reloaded')
  } finally {
    reloading = false
  }
}
