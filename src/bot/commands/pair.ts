import type { BotContext } from '../../types/context.js'
import {
  createPairingCode,
  getPairing,
  removePairing,
} from '../../remote/pairing-store.js'
import { getRelayPort } from '../../remote/relay-server.js'
import { env } from '../../config/env.js'

export async function pairCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const threadId = ctx.message?.message_thread_id
  const existing = getPairing(chatId, threadId)

  // Already paired and connected
  if (existing?.connected) {
    const elapsed = ((Date.now() - existing.createdAt) / 1000 / 60).toFixed(0)
    await ctx.reply(
      `🔗 *已配對* ${existing.label}\n` +
      `已連線 ${elapsed} 分鐘\n\n` +
      `用 /unpair 斷開`,
      { parse_mode: 'Markdown' },
    )
    return
  }

  // Generate new pairing code
  const code = createPairingCode(chatId, threadId)
  const port = getRelayPort() || env.RELAY_PORT

  await ctx.reply(
    `🔑 *配對碼: \`${code}\`*\n\n` +
    `請對方執行:\n` +
    '```\n' +
    `npx tsx src/remote/agent.ts ws://你的IP:${port} ${code}\n` +
    '```\n\n' +
    `或在 Electron app 輸入:\n` +
    `Server: \`ws://你的IP:${port}\`\n` +
    `配對碼: \`${code}\`\n\n` +
    `_配對碼 5 分鐘後過期，等待對方連線..._`,
    { parse_mode: 'Markdown' },
  )
}

export async function unpairCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const threadId = ctx.message?.message_thread_id
  const removed = removePairing(chatId, threadId)

  if (removed) {
    await ctx.reply('🔌 已斷開遠端配對。')
  } else {
    await ctx.reply('目前沒有配對的遠端連線。')
  }
}
