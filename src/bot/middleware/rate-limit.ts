import type { BotContext } from '../../types/context.js'
import { env } from '../../config/env.js'

interface RateLimitEntry {
  readonly timestamps: number[]
}

const limits = new Map<number, RateLimitEntry>()

// Periodic cleanup: remove entries with no recent activity
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000
  for (const [chatId, entry] of limits) {
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < cutoff) {
      limits.delete(chatId)
    }
  }
}, 60_000)

export function rateLimitMiddleware() {
  return async (ctx: BotContext, next: () => Promise<void>) => {
    const chatId = ctx.chat?.id
    if (!chatId) return next()

    const now = Date.now()
    const windowStart = now - env.RATE_LIMIT_WINDOW_MS

    let entry = limits.get(chatId)
    if (!entry) {
      entry = { timestamps: [] }
      limits.set(chatId, entry)
    }

    // Remove expired timestamps (mutating for perf in rate limiter only)
    const filtered = entry.timestamps.filter((t) => t > windowStart)
    entry.timestamps.length = 0
    entry.timestamps.push(...filtered)

    if (entry.timestamps.length >= env.RATE_LIMIT_MAX) {
      await ctx.reply('⏳ Rate limited. Please wait a moment.')
      return
    }

    entry.timestamps.push(now)
    return next()
  }
}
