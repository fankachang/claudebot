import type { BotContext } from '../../types/context.js'
import { getPairing } from '../../remote/pairing-store.js'
import { remoteToolCall } from '../../remote/relay-client.js'

export async function rstatusCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const threadId = ctx.message?.message_thread_id
  const pairing = getPairing(chatId, threadId)

  if (!pairing?.connected) {
    await ctx.reply('尚未配對遠端電腦，先用 /pair 建立連線。')
    return
  }

  const ack = await ctx.reply('🔍 查詢遠端狀態中…')

  try {
    const result = await remoteToolCall(pairing.code, 'remote_system_info', {}, 30_000)
    await ctx.telegram.deleteMessage(chatId, ack.message_id).catch(() => {})
    await ctx.reply(`🖥 *遠端狀態*\n\`\`\`\n${result.slice(0, 3800)}\n\`\`\``, { parse_mode: 'Markdown' })
  } catch (err) {
    await ctx.telegram.deleteMessage(chatId, ack.message_id).catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    await ctx.reply(`❌ 查詢失敗: ${msg}`)
  }
}
