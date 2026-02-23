import type { BotContext } from '../../types/context.js'
import { isProcessing } from '../../claude/queue.js'

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
  setTimeout(() => process.exit(0), 500)
}

export async function handleRestartCallback(ctx: BotContext, data: string): Promise<boolean> {
  if (!data.startsWith('restart:')) return false

  if (data === 'restart:force') {
    await ctx.editMessageText('🔄 強制重啟中...').catch(() => {})
    await ctx.answerCbQuery()
    setTimeout(() => process.exit(0), 500)
  } else if (data === 'restart:cancel') {
    await ctx.editMessageText('❌ 已取消重啟').catch(() => {})
    await ctx.answerCbQuery()
  }

  return true
}
