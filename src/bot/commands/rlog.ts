import type { BotContext } from '../../types/context.js'
import { getPairing } from '../../remote/pairing-store.js'
import { remoteToolCall } from '../../remote/relay-client.js'

export async function rlogCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const threadId = ctx.message?.message_thread_id
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text ?? '' : ''
  const args = text.replace(/^\/rlog\s*/i, '').trim()

  const pairing = getPairing(chatId, threadId)

  if (!pairing?.connected) {
    await ctx.reply('尚未配對遠端電腦，先用 /pair 建立連線。')
    return
  }

  // Parse: /rlog [service] [lines]
  // e.g. /rlog pm2 50, /rlog docker, /rlog 100
  const parts = args.split(/\s+/)
  let command: string
  let lines = 30

  if (!args) {
    // Default: pm2 logs
    command = 'pm2 logs --nostream --lines 30 2>&1 || echo "(pm2 not available)"'
  } else if (parts.length === 1 && /^\d+$/.test(parts[0])) {
    // /rlog 50 → pm2 with custom lines
    lines = Math.min(parseInt(parts[0], 10), 200)
    command = `pm2 logs --nostream --lines ${lines} 2>&1 || echo "(pm2 not available)"`
  } else {
    const service = parts[0]
    if (parts.length > 1 && /^\d+$/.test(parts[1])) {
      lines = Math.min(parseInt(parts[1], 10), 200)
    }

    // Map common service names to commands
    const cmdMap: Record<string, string> = {
      pm2: `pm2 logs --nostream --lines ${lines} 2>&1`,
      docker: `docker logs --tail ${lines} $(docker ps -q | head -1) 2>&1 || echo "(no running containers)"`,
      nginx: `tail -n ${lines} /var/log/nginx/error.log 2>&1 || echo "(no nginx logs)"`,
      system: process.platform === 'win32'
        ? `powershell -NoProfile -Command "Get-EventLog -LogName System -Newest ${lines} | Format-List"`
        : `journalctl -n ${lines} --no-pager 2>&1 || tail -n ${lines} /var/log/syslog 2>&1`,
    }

    command = cmdMap[service] ?? `${service} 2>&1 | tail -n ${lines}`
  }

  const ack = await ctx.reply('📋 取得遠端 log 中…')

  try {
    const result = await remoteToolCall(
      pairing.code,
      'remote_execute_command',
      { command, timeout: 30_000 },
      60_000,
    )
    await ctx.telegram.deleteMessage(chatId, ack.message_id).catch(() => {})

    const trimmed = result.slice(-3800) // Keep last portion if too long
    const prefix = result.length > 3800 ? '…(truncated)\n' : ''
    await ctx.reply(`📋 *遠端 Log*\n\`\`\`\n${prefix}${trimmed}\n\`\`\``, { parse_mode: 'Markdown' })
  } catch (err) {
    await ctx.telegram.deleteMessage(chatId, ack.message_id).catch(() => {})
    const msg = err instanceof Error ? err.message : String(err)
    await ctx.reply(`❌ 取得 log 失敗: ${msg}`)
  }
}
