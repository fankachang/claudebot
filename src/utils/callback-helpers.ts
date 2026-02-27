import type { BotContext } from '../types/context.js'

/** Extract thread ID from a callback query's parent message. */
export function getThreadId(ctx: BotContext): number | undefined {
  const msg = ctx.callbackQuery?.message
  return msg && 'message_thread_id' in msg ? msg.message_thread_id : undefined
}
