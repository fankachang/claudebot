import { Markup } from 'telegraf'
import type { Plugin } from '../../types/plugin.js'
import type { BotContext } from '../../types/context.js'

interface Reminder {
  readonly chatId: number
  readonly text: string
  readonly fireAt: number
  readonly timer: ReturnType<typeof setTimeout>
}

interface ActiveTimer {
  readonly chatId: number
  readonly msgId: number
  readonly seconds: number
  readonly startedAt: number
  readonly timer: ReturnType<typeof setTimeout>
  readonly tickInterval: ReturnType<typeof setInterval>
}

const QUICK_PRESETS = [
  { label: '45s', seconds: 45 },
  { label: '1m', seconds: 60 },
  { label: '1m30s', seconds: 90 },
  { label: '2m', seconds: 120 },
]

const reminders = new Map<string, Reminder>()
const activeTimers = new Map<number, ActiveTimer>() // chatId → timer

type SendFn = (chatId: number, text: string, extra?: Record<string, unknown>) => Promise<void>
let sendFn: SendFn | null = null

export function setReminderSendFn(fn: SendFn): void {
  sendFn = fn
}

function parseTime(input: string): { ms: number; label: string } | null {
  const parts = input.matchAll(/(\d+)\s*(s|m|h)/gi)
  let totalMs = 0
  const labels: string[] = []

  for (const match of parts) {
    const val = parseInt(match[1], 10)
    const unit = match[2].toLowerCase()
    if (unit === 's') { totalMs += val * 1000; labels.push(`${val}秒`) }
    if (unit === 'm') { totalMs += val * 60_000; labels.push(`${val}分`) }
    if (unit === 'h') { totalMs += val * 3_600_000; labels.push(`${val}時`) }
  }

  if (totalMs === 0) return null
  return { ms: totalMs, label: labels.join('') }
}

function buildQuickButtons(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    QUICK_PRESETS.map((p) =>
      Markup.button.callback(p.label, `remind:quick:${p.seconds}`)
    ),
    [Markup.button.callback('取消', 'remind:cancel')],
  ])
}

function formatCountdown(remaining: number): string {
  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  if (mins > 0) return `${mins}:${secs.toString().padStart(2, '0')}`
  return `${secs}s`
}

function buildProgressBar(elapsed: number, total: number): string {
  const width = 10
  const filled = Math.min(width, Math.round((elapsed / total) * width))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

async function reminderCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const raw = (ctx.message && 'text' in ctx.message) ? ctx.message.text : ''
  const args = raw.replace(/^\/remind\s*/, '').trim()

  // /remind (no args) → quick timer buttons
  if (!args) {
    await ctx.reply(
      '⏱️ *快速計時*\n選擇休息時間：',
      { parse_mode: 'Markdown', ...buildQuickButtons() },
    )
    return
  }

  // /remind list
  if (args === 'list' || args === 'ls') {
    const userReminders = [...reminders.entries()]
      .filter(([, r]) => r.chatId === chatId)
      .map(([id, r]) => {
        const remaining = Math.max(0, r.fireAt - Date.now())
        const mins = Math.ceil(remaining / 60_000)
        return `• ${r.text} (${mins}分後) [${id}]`
      })

    const active = activeTimers.get(chatId)
    if (active) {
      const remaining = Math.max(0, active.seconds - Math.floor((Date.now() - active.startedAt) / 1000))
      userReminders.unshift(`• ⏱️ 快速計時 (${formatCountdown(remaining)})`)
    }

    if (userReminders.length === 0) {
      await ctx.reply('📋 沒有進行中的提醒')
      return
    }
    await ctx.reply(`⏰ *提醒列表*\n${userReminders.join('\n')}`, { parse_mode: 'Markdown' })
    return
  }

  // /remind clear
  if (args === 'clear') {
    let cleared = 0
    for (const [id, r] of reminders) {
      if (r.chatId === chatId) {
        clearTimeout(r.timer)
        reminders.delete(id)
        cleared++
      }
    }
    const active = activeTimers.get(chatId)
    if (active) {
      clearTimeout(active.timer)
      clearInterval(active.tickInterval)
      activeTimers.delete(chatId)
      cleared++
    }
    await ctx.reply(`🗑️ 已清除 ${cleared} 個提醒`)
    return
  }

  // /remind stop
  if (args === 'stop') {
    const active = activeTimers.get(chatId)
    if (active) {
      clearTimeout(active.timer)
      clearInterval(active.tickInterval)
      activeTimers.delete(chatId)
      await ctx.reply('⏹️ 計時已停止')
    } else {
      await ctx.reply('沒有正在進行的計時')
    }
    return
  }

  // /remind 5m 喝水
  const timeMatch = args.match(/^([\d]+[smh][\d]*[smh]?[\d]*[smh]?)\s+(.+)$/i)
  if (!timeMatch) {
    await ctx.reply(
      '⏰ *提醒用法*\n'
      + '`/remind` — 快速計時按鈕\n'
      + '`/remind 5m 喝水` — 5分鐘後提醒\n'
      + '`/remind 1h30m 開會` — 1.5小時後\n'
      + '`/remind list` — 查看提醒\n'
      + '`/remind stop` — 停止計時\n'
      + '`/remind clear` — 清除全部',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const parsed = parseTime(timeMatch[1])
  if (!parsed) {
    await ctx.reply('❌ 無效的時間格式，支援 s/m/h (例: 5m, 1h30m)')
    return
  }

  const text = timeMatch[2].trim()
  const id = `r${Date.now()}`

  const timer = setTimeout(async () => {
    reminders.delete(id)
    if (sendFn) {
      await sendFn(chatId, `⏰ *提醒！*\n${text}`).catch(() => {})
    }
  }, parsed.ms)

  reminders.set(id, {
    chatId,
    text,
    fireAt: Date.now() + parsed.ms,
    timer,
  })

  await ctx.reply(`✅ 已設定提醒：${parsed.label}後\n📝 ${text}`)
}

async function handleCallback(ctx: BotContext, data: string): Promise<boolean> {
  if (!data.startsWith('remind:')) return false

  const chatId = ctx.chat?.id
  if (!chatId) return true

  // Cancel button
  if (data === 'remind:cancel') {
    const active = activeTimers.get(chatId)
    if (active) {
      clearTimeout(active.timer)
      clearInterval(active.tickInterval)
      activeTimers.delete(chatId)
    }
    await ctx.editMessageText('⏹️ 已取消').catch(() => {})
    await ctx.answerCbQuery()
    return true
  }

  // Quick timer button
  const quickMatch = data.match(/^remind:quick:(\d+)$/)
  if (quickMatch) {
    const seconds = parseInt(quickMatch[1], 10)
    const msgId = ctx.callbackQuery?.message?.message_id

    // Clear existing
    const existing = activeTimers.get(chatId)
    if (existing) {
      clearTimeout(existing.timer)
      clearInterval(existing.tickInterval)
      activeTimers.delete(chatId)
    }

    // Edit message → countdown
    const bar = buildProgressBar(0, seconds)
    await ctx.editMessageText(
      `⏱️ *休息中* ${formatCountdown(seconds)}\n${bar}`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⏹️ 停止', 'remind:cancel')]]) },
    ).catch(() => {})
    await ctx.answerCbQuery(`⏱️ ${seconds}s 開始`)

    if (!msgId) return true

    const startedAt = Date.now()

    // Update every 5s
    const tickInterval = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const remaining = Math.max(0, seconds - elapsed)
      if (remaining <= 0) return

      const updatedBar = buildProgressBar(elapsed, seconds)
      try {
        await ctx.telegram.editMessageText(
          chatId, msgId, undefined,
          `⏱️ *休息中* ${formatCountdown(remaining)}\n${updatedBar}`,
          { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⏹️ 停止', 'remind:cancel')]]) },
        )
      } catch { /* message not modified */ }
    }, 5_000)

    // Fire when done
    const fireTimer = setTimeout(async () => {
      clearInterval(tickInterval)
      activeTimers.delete(chatId)

      // Mark countdown message done
      try {
        await ctx.telegram.editMessageText(
          chatId, msgId, undefined, '✅ 休息結束！',
        )
      } catch { /* ignore */ }

      // New message with buttons for next set
      if (sendFn) {
        await sendFn(
          chatId,
          `⏰ *時間到！* 休息 ${formatCountdown(seconds)} 結束\n下一組準備好了嗎？`,
          { ...buildQuickButtons() },
        ).catch(() => {})
      }
    }, seconds * 1000)

    activeTimers.set(chatId, {
      chatId,
      msgId,
      seconds,
      startedAt,
      timer: fireTimer,
      tickInterval,
    })

    return true
  }

  return false
}

const reminderPlugin: Plugin = {
  name: 'reminder',
  description: '計時器 & 提醒',
  commands: [
    {
      name: 'remind',
      description: '快速計時 / 定時提醒',
      handler: reminderCommand,
    },
  ],
  onCallback: handleCallback,
  cleanup: async () => {
    for (const [, r] of reminders) {
      clearTimeout(r.timer)
    }
    reminders.clear()
    for (const [, t] of activeTimers) {
      clearTimeout(t.timer)
      clearInterval(t.tickInterval)
    }
    activeTimers.clear()
  },
}

export default reminderPlugin
