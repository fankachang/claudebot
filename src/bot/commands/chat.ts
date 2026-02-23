import type { BotContext } from '../../types/context.js'
import { setUserProject } from '../state.js'

const GENERAL_PROJECT = { name: 'general', path: process.cwd() }

export async function chatCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const threadId = ctx.message && 'message_thread_id' in ctx.message
    ? ctx.message.message_thread_id
    : undefined

  setUserProject(chatId, GENERAL_PROJECT, threadId)
  await ctx.reply('\u{1F4AC} \u{5DF2}\u{9032}\u{5165}\u{901A}\u{7528}\u{6A21}\u{5F0F}\u{3002}\u{76F4}\u{63A5}\u{8F38}\u{5165}\u{5373}\u{53EF}\u{5C0D}\u{8A71}\u{3002}\n\u{7528} /projects \u{53EF}\u{5207}\u{63DB}\u{5230}\u{5C08}\u{6848}\u{6A21}\u{5F0F}\u{3002}')
}
