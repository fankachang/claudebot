import type { Plugin } from '../../types/plugin.js'
import type { BotContext } from '../../types/context.js'

// --- Scheduled tasks storage ---

interface ScheduledTask {
  readonly id: string
  readonly chatId: number
  readonly time: string // "09:00" format
  readonly type: 'bitcoin-price' | 'custom'
  readonly enabled: boolean
}

const tasks: Map<string, ScheduledTask> = new Map()
let schedulerInterval: NodeJS.Timeout | null = null

// Callback to send Telegram messages (injected from bot.ts)
let sendMessage: ((chatId: number, text: string, extra?: { parse_mode?: 'Markdown' }) => Promise<void>) | null = null

export function setSchedulerSendFn(fn: typeof sendMessage): void {
  sendMessage = fn
}

// --- Task implementations ---

async function fetchBitcoinPrice(): Promise<string> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,twd', {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`API ${res.status}`)

    const data = await res.json() as { bitcoin?: { usd?: number; twd?: number } }
    const usd = data.bitcoin?.usd
    const twd = data.bitcoin?.twd

    if (!usd || !twd) throw new Error('Missing price data')

    const lines = [
      '₿ *Bitcoin 價格*',
      '',
      `💵 *USD:* $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `💰 *TWD:* NT$${twd.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      '',
      `_${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}_`,
    ]

    return lines.join('\n')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return `❌ 無法取得比特幣價格: ${msg}`
  }
}

async function executeTask(task: ScheduledTask): Promise<void> {
  if (!sendMessage) return

  switch (task.type) {
    case 'bitcoin-price': {
      const message = await fetchBitcoinPrice()
      await sendMessage(task.chatId, message, { parse_mode: 'Markdown' })
      break
    }
    default:
      console.warn(`[scheduler] Unknown task type: ${task.type}`)
  }
}

// --- Scheduler loop ---

function startScheduler(): void {
  if (schedulerInterval) return

  // Check every minute
  schedulerInterval = setInterval(() => {
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    for (const task of tasks.values()) {
      if (task.enabled && task.time === currentTime) {
        executeTask(task).catch((err) => {
          console.error('[scheduler] Task execution failed:', err)
        })
      }
    }
  }, 60_000) // Check every 60 seconds
}

function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
}

// --- Commands ---

async function scheduleCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text : ''
  const args = text.replace(/^\/schedule\s*/i, '').trim()

  if (!args) {
    // List current tasks
    const userTasks = [...tasks.values()].filter((t) => t.chatId === chatId)

    if (userTasks.length === 0) {
      await ctx.reply(
        '📅 *排程任務*\n\n' +
        '目前沒有排程任務\n\n' +
        '*用法:*\n' +
        '`/schedule bitcoin 09:00` — 每天 9 點推播比特幣價格\n' +
        '`/schedule list` — 列出所有任務\n' +
        '`/schedule remove <id>` — 移除任務',
        { parse_mode: 'Markdown' },
      )
      return
    }

    const lines = ['📅 *你的排程任務*', '']
    for (const task of userTasks) {
      const status = task.enabled ? '✅' : '❌'
      const typeLabel = task.type === 'bitcoin-price' ? '₿ Bitcoin 價格' : task.type
      lines.push(`${status} \`${task.id}\` — ${typeLabel} @ ${task.time}`)
    }
    lines.push('')
    lines.push('用 `/schedule remove <id>` 移除任務')

    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
    return
  }

  // Parse command
  const parts = args.split(/\s+/)
  const subcommand = parts[0].toLowerCase()

  if (subcommand === 'list') {
    return scheduleCommand(ctx)
  }

  if (subcommand === 'remove' || subcommand === 'delete') {
    const id = parts[1]
    if (!id) {
      await ctx.reply('⚠️ 請指定任務 ID\n\n用法: `/schedule remove <id>`', { parse_mode: 'Markdown' })
      return
    }

    const task = tasks.get(id)
    if (!task || task.chatId !== chatId) {
      await ctx.reply(`❌ 找不到任務 \`${id}\``, { parse_mode: 'Markdown' })
      return
    }

    tasks.delete(id)
    await ctx.reply(`✅ 已移除任務 \`${id}\``, { parse_mode: 'Markdown' })
    return
  }

  // Add new task: /schedule bitcoin 09:00
  if (subcommand === 'bitcoin') {
    const time = parts[1]
    if (!time || !/^\d{1,2}:\d{2}$/.test(time)) {
      await ctx.reply(
        '⚠️ 時間格式錯誤\n\n' +
        '用法: `/schedule bitcoin 09:00`\n' +
        '時間格式: `HH:MM` (24 小時制)',
        { parse_mode: 'Markdown' },
      )
      return
    }

    // Normalize time to HH:MM
    const [h, m] = time.split(':')
    const normalizedTime = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`

    const id = `btc-${chatId}-${Date.now()}`
    const task: ScheduledTask = {
      id,
      chatId,
      time: normalizedTime,
      type: 'bitcoin-price',
      enabled: true,
    }

    tasks.set(id, task)
    startScheduler()

    await ctx.reply(
      `✅ 已設定排程任務\n\n` +
      `₿ 每天 *${normalizedTime}* 推播比特幣價格\n\n` +
      `任務 ID: \`${id}\``,
      { parse_mode: 'Markdown' },
    )
    return
  }

  await ctx.reply(
    '⚠️ 未知指令\n\n' +
    '*可用指令:*\n' +
    '`/schedule bitcoin 09:00` — 設定比特幣價格推播\n' +
    '`/schedule list` — 列出任務\n' +
    '`/schedule remove <id>` — 移除任務',
    { parse_mode: 'Markdown' },
  )
}

// --- Cleanup ---

async function cleanup(): Promise<void> {
  stopScheduler()
  tasks.clear()
}

// --- Plugin export ---

const schedulerPlugin: Plugin = {
  name: 'scheduler',
  description: '定時任務排程',
  commands: [
    {
      name: 'schedule',
      description: '管理定時任務（比特幣價格等）',
      handler: scheduleCommand,
    },
  ],
  cleanup,
}

export default schedulerPlugin
