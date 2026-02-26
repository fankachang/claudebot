import type { BotContext } from '../../types/context.js'
import { isProcessing } from '../../claude/queue.js'
import { getBotInstance } from '../bot.js'

// Exit code 42 = intentional restart (distinguished from crashes in launcher)
const RESTART_EXIT_CODE = 42

async function gracefulRestart(): Promise<void> {
  const bot = getBotInstance()
  // Stop Telegraf polling first so Telegram releases the session immediately.
  // Without this, the respawned bot hits 409 Conflict for up to 30s.
  if (bot) {
    try {
      bot.stop('restart')
    } catch {
      // Best-effort — proceed with exit even if stop fails
    }
  }
  // Small delay to let the stop signal propagate
  setTimeout(() => process.exit(RESTART_EXIT_CODE), 500)
}

export async function restartCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  if (isProcessing()) {
    await ctx.reply('⚠️ 有任務正在執行中，確定要重啟嗎？', {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ 強制重啟', callback_data: 'restart:force' },
          { text: '❌ 取消', callback_data: 'restart:cancel' },
        ]],
      },
    })
    return
  }

  await ctx.reply('🔄 重啟中...')
  await gracefulRestart()
}

export async function handleRestartCallback(ctx: BotContext, data: string): Promise<boolean> {
  if (!data.startsWith('restart:')) return false

  if (data === 'restart:force') {
    await ctx.editMessageText('🔄 強制重啟中...').catch(() => {})
    await ctx.answerCbQuery()
    await gracefulRestart()
  } else if (data === 'restart:cancel') {
    await ctx.editMessageText('❌ 已取消重啟').catch(() => {})
    await ctx.answerCbQuery()
  }

  return true
}
