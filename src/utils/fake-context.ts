/**
 * Creates a minimal BotContext-like object for executing plugin commands
 * programmatically (e.g. when Claude uses @cmd() directives).
 *
 * Only the subset of ctx that plugins actually use is implemented:
 * - ctx.chat.id
 * - ctx.message.text
 * - ctx.reply()
 */

import type { Telegraf } from 'telegraf'
import type { BotContext } from '../types/context.js'

interface FakeContextOptions {
  readonly chatId: number
  readonly commandText: string // e.g. "/schedule bitcoin 09:00"
  readonly telegram: Telegraf<BotContext>['telegram']
}

/**
 * Returns a minimal object that satisfies what most plugin handlers
 * read from ctx.  It is NOT a full Telegraf context — only use for
 * dispatching simple commands.
 */
export function createFakeContext(opts: FakeContextOptions): BotContext {
  const { chatId, commandText, telegram } = opts

  const reply: BotContext['reply'] = (text, extra) => {
    return telegram.sendMessage(chatId, text, extra) as ReturnType<BotContext['reply']>
  }

  const replyWithDocument: BotContext['replyWithDocument'] = (document, extra) => {
    return telegram.sendDocument(chatId, document, extra) as ReturnType<BotContext['replyWithDocument']>
  }

  const replyWithPhoto: BotContext['replyWithPhoto'] = (photo, extra) => {
    return telegram.sendPhoto(chatId, photo, extra) as ReturnType<BotContext['replyWithPhoto']>
  }

  // Minimal shape that plugins actually read
  return {
    chat: { id: chatId },
    message: { text: commandText },
    reply,
    replyWithDocument,
    replyWithPhoto,
    telegram,
  } as unknown as BotContext
}
