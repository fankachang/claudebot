/**
 * After bot restarts, notify users who had an active project
 * with a "Continue?" inline button so they can resume seamlessly.
 */

import type { Telegraf } from 'telegraf'
import type { BotContext } from '../types/context.js'
import { getActiveUserStates } from './state.js'
import { formatAILabel } from '../ai/types.js'

const NOTIFY_DELAY_MS = 3_000

function deriveBotLabel(): string {
  const envArg = process.argv.find((_, i, arr) => arr[i - 1] === '--env')
  if (!envArg || envArg === '.env') return 'Bot'
  // .env.bot5 → "Bot [5]"
  const num = envArg.replace(/^\.env\.bot/, '')
  return `Bot [${num}]`
}

export function scheduleRestartNotifications(bot: Telegraf<BotContext>): void {
  setTimeout(() => {
    const states = getActiveUserStates()
    const label = deriveBotLabel()

    for (const [key, state] of states) {
      if (!state.selectedProject) continue

      // key format: "chatId" or "chatId:threadId"
      const chatId = parseInt(key.split(':')[0], 10)
      if (isNaN(chatId) || chatId === 0) continue

      const project = state.selectedProject.name
      const ai = formatAILabel(state.ai)

      bot.telegram.sendMessage(
        chatId,
        `🔄 ${label} 已重啟，已自動帶入 *${project}*\n_${ai}_`,
        { parse_mode: 'Markdown' },
      ).catch((err) => {
        console.error(`[restart-notify] Failed to notify ${chatId}:`, err.message)
      })
    }
  }, NOTIFY_DELAY_MS)
}
