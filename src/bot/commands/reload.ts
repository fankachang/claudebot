import { env } from '../../config/env.js'
import type { BotContext } from '../../types/context.js'
import { reloadPlugins, getLoadedPlugins } from '../../plugins/loader.js'
import { getBotInstance, CORE_COMMANDS, wireReminderSendFn } from '../bot.js'

export async function reloadCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  try {
    const before = getLoadedPlugins().length
    const plugins = await reloadPlugins(env.PLUGINS)

    // Re-wire reminder sendFn using the same module instance from loader
    const bot = getBotInstance()
    if (bot) {
      wireReminderSendFn(bot)

      // Update Telegram command list
      const pluginCommands = plugins.flatMap((p) =>
        p.commands.map((cmd) => ({ command: cmd.name, description: cmd.description }))
      )
      await bot.telegram.setMyCommands([...CORE_COMMANDS, ...pluginCommands]).catch(() => {})
    }

    const names = plugins.map((p) => p.name).join(', ')
    const cmdCount = plugins.reduce((sum, p) => sum + p.commands.length, 0)

    await ctx.reply(
      `*Plugin 熱重載完成*\n`
      + `載入前: ${before} 個插件\n`
      + `載入後: ${plugins.length} 個插件, ${cmdCount} 個指令\n`
      + (names ? `插件: ${names}` : '（無啟用插件）'),
      { parse_mode: 'Markdown' }
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await ctx.reply(`重載失敗: ${msg}`)
  }
}
