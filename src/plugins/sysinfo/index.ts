import { hostname, platform, arch, cpus, totalmem, freemem, uptime } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Plugin } from '../../types/plugin.js'
import type { BotContext } from '../../types/context.js'

const execFileAsync = promisify(execFile)

function formatBytes(bytes: number): string {
  const gb = bytes / 1_073_741_824
  return `${gb.toFixed(1)} GB`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}天`)
  if (hours > 0) parts.push(`${hours}時`)
  parts.push(`${mins}分`)
  return parts.join('')
}

async function getGpuInfo(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name',
    ], { timeout: 5_000, windowsHide: true })
    return stdout.trim() || '未知'
  } catch {
    return '未知'
  }
}

interface DiskInfo {
  readonly drive: string
  readonly total: string
  readonly free: string
  readonly usedPercent: string
}

async function getDiskInfo(): Promise<readonly DiskInfo[]> {
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | ForEach-Object { \"$($_.DeviceID)|$($_.Size)|$($_.FreeSpace)\" }",
    ], { timeout: 5_000, windowsHide: true })

    return stdout.trim().split('\n').filter(Boolean).map((line) => {
      const [drive, sizeStr, freeStr] = line.trim().split('|')
      const total = Number(sizeStr)
      const free = Number(freeStr)
      const used = total - free
      const usedPercent = total > 0 ? ((used / total) * 100).toFixed(0) : '0'
      return {
        drive,
        total: formatBytes(total),
        free: formatBytes(free),
        usedPercent,
      }
    })
  } catch {
    return []
  }
}

async function sysinfoCommand(ctx: BotContext): Promise<void> {
  const cpu = cpus()
  const cpuModel = cpu.length > 0 ? cpu[0].model : '未知'
  const cpuCores = cpu.length
  const totalMem = totalmem()
  const freeMem = freemem()
  const usedMem = totalMem - freeMem
  const memPercent = ((usedMem / totalMem) * 100).toFixed(0)

  const [gpu, disks] = await Promise.all([getGpuInfo(), getDiskInfo()])

  const info = [
    `🖥️ *系統資訊*`,
    ``,
    `*主機:* ${hostname()}`,
    `*平台:* ${platform()} ${arch()}`,
    `*CPU:* ${cpuModel}`,
    `*核心:* ${cpuCores}`,
    `*GPU:* ${gpu}`,
    `*記憶體:* ${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${memPercent}%)`,
    `*可用:* ${formatBytes(freeMem)}`,
    `*開機時間:* ${formatUptime(uptime())}`,
  ]

  if (disks.length > 0) {
    info.push(``)
    info.push(`💾 *硬碟*`)
    for (const d of disks) {
      info.push(`*${d.drive}* ${d.free} 可用 / ${d.total} (已用 ${d.usedPercent}%)`)
    }
  }

  await ctx.reply(info.join('\n'), { parse_mode: 'Markdown' })
}

const sysinfoPlugin: Plugin = {
  name: 'sysinfo',
  description: '系統資訊查看',
  commands: [
    {
      name: 'sysinfo',
      description: '查看系統資訊',
      handler: sysinfoCommand,
    },
  ],
}

export default sysinfoPlugin
