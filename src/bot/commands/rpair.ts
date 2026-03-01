import type { BotContext } from '../../types/context.js'
import { getPairing, removePairing } from '../../remote/pairing-store.js'
import { remoteToolCall } from '../../remote/relay-client.js'

/**
 * /rpair - Restart remote agent (for debugging / applying code changes)
 *
 * Kills the remote agent process so it can restart with updated code.
 * User needs to re-pair after this command.
 */
export async function rpairCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const threadId = ctx.message?.message_thread_id
  const pairing = getPairing(chatId, threadId)

  if (!pairing?.connected) {
    await ctx.reply('目前沒有配對的遠端電腦。')
    return
  }

  try {
    // Kill remote agent process(es) via remote_execute_command
    await remoteToolCall(
      pairing.code,
      'remote_execute_command',
      {
        command: 'taskkill /F /FI "COMMANDLINE like %agent.ts%ws://%"',
      },
      10_000,
    )

    // Remove local pairing so user knows they need to re-pair
    removePairing(chatId, threadId)

    await ctx.reply(
      '✅ 遠端 agent 已重啟\n\n' +
      '⚠️ 配對已清除，請重新執行 `/pair` 建立連線。',
      { parse_mode: 'Markdown' },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await ctx.reply(
      `❌ 重啟失敗: ${msg}\n\n` +
      '💡 提示：可能遠端 agent 已經斷線，請手動重啟後再 `/pair`。',
    )
  }
}
