/**
 * Creates a minimal BotContext-like object for executing plugin commands
 * programmatically (e.g. when Claude uses @cmd() directives).
 *
 * Uses a Proxy to auto-delegate unknown replyWith* methods to the
 * corresponding telegram.send* call, so new Telegram methods work
 * without manual additions.
 */

import type { Telegraf } from 'telegraf'
import type { BotContext } from '../types/context.js'

interface FakeContextOptions {
  readonly chatId: number
  readonly threadId?: number
  readonly commandText: string // e.g. "/schedule bitcoin 09:00"
  readonly telegram: Telegraf<BotContext>['telegram']
}

/**
 * Returns a minimal object that satisfies what plugin handlers
 * read from ctx. Uses Proxy for future-proof replyWith* delegation.
 */
export function createFakeContext(opts: FakeContextOptions): BotContext {
  const { chatId, threadId, commandText, telegram } = opts

  const reply: BotContext['reply'] = (text, extra) => {
    return telegram.sendMessage(chatId, text, extra) as ReturnType<BotContext['reply']>
  }

  const base = {
    chat: { id: chatId },
    message: {
      text: commandText,
      message_thread_id: threadId,
    },
    reply,
    telegram,
  }

  // Proxy: auto-delegate replyWithPhoto → telegram.sendPhoto, etc.
  return new Proxy(base, {
    get(target, prop, receiver) {
      // Direct properties first
      if (prop in target) {
        return Reflect.get(target, prop, receiver)
      }

      // replyWith* → telegram.send*
      if (typeof prop === 'string' && prop.startsWith('replyWith')) {
        const method = 'send' + prop.slice(9) // replyWithPhoto → sendPhoto
        const telegramFn = (telegram as unknown as Record<string, unknown>)[method]
        if (typeof telegramFn === 'function') {
          return (...args: unknown[]) => telegramFn.call(telegram, chatId, ...args)
        }
      }

      return undefined
    },
  }) as unknown as BotContext
}
