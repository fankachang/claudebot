import type { BotContext } from '../../types/context.js'
import { fetchRegistry, isInstalled, getEnabledPlugins } from '../../plugins/plugin-manager.js'
import type { RegistryEntry } from '../../plugins/plugin-manager.js'

function formatPluginDetail(entry: RegistryEntry, installed: boolean, enabled: boolean): string {
  const status = installed
    ? (enabled ? '✅ 已啟用' : '⏸️ 已安裝（未啟用）')
    : '📦 可安裝'

  const cmds = entry.commands.map((c) => `  /${c.name} — ${c.description}`).join('\n')

  return [
    `*${entry.name}* ${status}`,
    entry.description,
    `作者: ${entry.author}`,
    entry.version ? `版本: ${entry.version}` : '',
    '',
    '*指令:*',
    cmds,
    '',
    installed ? `卸載: \`/uninstall ${entry.name}\`` : `安裝: \`/install ${entry.name}\``,
  ].filter(Boolean).join('\n')
}

export async function storeCommand(ctx: BotContext): Promise<void> {
  const raw = (ctx.message && 'text' in ctx.message) ? ctx.message.text : ''
  const arg = raw.replace(/^\/store(@\S+)?\s*/, '').trim()

  try {
    const registry = await fetchRegistry()

    if (registry.length === 0) {
      await ctx.reply('📦 Plugin Store 目前沒有可用插件。')
      return
    }

    const enabledList = getEnabledPlugins()

    // /store <name> → show detail
    if (arg) {
      const entry = registry.find((e) => e.name === arg)
      if (!entry) {
        await ctx.reply(`❌ 找不到插件 \`${arg}\``, { parse_mode: 'Markdown' })
        return
      }
      const installed = isInstalled(entry.name)
      const enabled = enabledList.includes(entry.name)
      await ctx.reply(formatPluginDetail(entry, installed, enabled), { parse_mode: 'Markdown' })
      return
    }

    // /store → list all
    const lines = registry.map((entry) => {
      const installed = isInstalled(entry.name)
      const enabled = enabledList.includes(entry.name)
      const icon = installed
        ? (enabled ? '✅' : '⏸️')
        : '📦'
      return `${icon} *${entry.name}* — ${entry.description}`
    })

    const text = [
      '🏪 *Plugin Store*',
      '',
      ...lines,
      '',
      '查看詳情: `/store <名稱>`',
      '安裝: `/install <名稱>`',
      '卸載: `/uninstall <名稱>`',
    ].join('\n')

    await ctx.reply(text, { parse_mode: 'Markdown' })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await ctx.reply(`❌ 無法載入 Plugin Store: ${msg}`)
  }
}
