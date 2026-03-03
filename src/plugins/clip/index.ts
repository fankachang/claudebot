import type { Plugin } from '../../types/plugin.js'
import type { BotContext } from '../../types/context.js'
import { resolve } from 'node:path'
import { createJsonFileStore } from '../../utils/json-file-store.js'

interface ClipEntry {
  readonly name: string
  readonly text: string
  readonly project: string
  readonly savedAt: number
}

type ClipData = Record<string, ClipEntry[]>  // keyed by chatId

const MAX_CLIPS = 20
const store = createJsonFileStore<ClipData>(resolve('data/clips.json'), () => ({}))

function getClips(chatId: number): readonly ClipEntry[] {
  return store.load()[String(chatId)] ?? []
}

function addClip(chatId: number, entry: ClipEntry): boolean {
  const data = store.load()
  const key = String(chatId)
  const list = [...(data[key] ?? [])]

  // Overwrite if same name exists
  const existIdx = list.findIndex(c => c.name === entry.name)
  if (existIdx >= 0) {
    list[existIdx] = entry
  } else {
    if (list.length >= MAX_CLIPS) {
      list.shift()  // remove oldest
    }
    list.push(entry)
  }

  store.save({ ...data, [key]: list })
  return true
}

function removeClip(chatId: number, name: string): boolean {
  const data = store.load()
  const key = String(chatId)
  const list = data[key] ?? []
  const filtered = list.filter(c => c.name !== name)

  if (filtered.length === list.length) return false

  store.save({ ...data, [key]: filtered })
  return true
}

async function saveCommand(ctx: BotContext): Promise<void> {
  const raw = (ctx.message && 'text' in ctx.message) ? ctx.message.text : ''
  const name = raw.replace(/^\/save\s*/, '').trim()

  // Must be a reply to a message
  const reply = ctx.message && 'reply_to_message' in ctx.message
    ? ctx.message.reply_to_message
    : null

  if (!reply) {
    await ctx.reply('💡 用法：回覆一條訊息並打 `/save 名稱`', { parse_mode: 'Markdown' })
    return
  }

  const text = reply && 'text' in reply ? reply.text ?? '' : ''
  if (!text) {
    await ctx.reply('❌ 該訊息沒有文字內容')
    return
  }

  const clipName = name || `clip-${Date.now().toString(36)}`
  const project = (ctx as unknown as { selectedProject?: { name: string } }).selectedProject?.name ?? ''

  addClip(ctx.chat!.id, {
    name: clipName,
    text,
    project,
    savedAt: Date.now(),
  })

  await ctx.reply(`📌 已存: \`${clipName}\`\n用 \`/recall ${clipName}\` 叫回來`, { parse_mode: 'Markdown' })
}

async function recallCommand(ctx: BotContext): Promise<void> {
  const raw = (ctx.message && 'text' in ctx.message) ? ctx.message.text : ''
  const name = raw.replace(/^\/recall\s*/, '').trim()
  const chatId = ctx.chat!.id
  const clips = getClips(chatId)

  if (clips.length === 0) {
    await ctx.reply('📭 沒有存任何訊息。回覆一條訊息並打 `/save 名稱` 來存', { parse_mode: 'Markdown' })
    return
  }

  // No name → list all clips
  if (!name) {
    const lines = clips.map((c, i) => {
      const date = new Date(c.savedAt).toLocaleDateString('zh-TW')
      const preview = c.text.slice(0, 40).replace(/\n/g, ' ')
      const proj = c.project ? ` [${c.project}]` : ''
      return `${i + 1}. \`${c.name}\`${proj} — ${preview}${c.text.length > 40 ? '...' : ''} _(${date})_`
    })
    await ctx.reply(`📋 *已存訊息 (${clips.length})*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' })
    return
  }

  // Find by name (exact or partial match)
  const clip = clips.find(c => c.name === name)
    ?? clips.find(c => c.name.includes(name))

  if (!clip) {
    await ctx.reply(`❌ 找不到 \`${name}\`\n用 \`/recall\` 查看所有已存訊息`, { parse_mode: 'Markdown' })
    return
  }

  const header = `📌 **${clip.name}**${clip.project ? ` [${clip.project}]` : ''}\n\n`
  await ctx.reply(header + clip.text, { parse_mode: 'Markdown' }).catch(() => {
    // Fallback without markdown if parsing fails
    ctx.reply(header + clip.text)
  })
}

async function unsaveCommand(ctx: BotContext): Promise<void> {
  const raw = (ctx.message && 'text' in ctx.message) ? ctx.message.text : ''
  const name = raw.replace(/^\/unsave\s*/, '').trim()

  if (!name) {
    await ctx.reply('💡 用法：`/unsave 名稱`', { parse_mode: 'Markdown' })
    return
  }

  const removed = removeClip(ctx.chat!.id, name)
  if (removed) {
    await ctx.reply(`🗑 已刪除: \`${name}\``, { parse_mode: 'Markdown' })
  } else {
    await ctx.reply(`❌ 找不到 \`${name}\``, { parse_mode: 'Markdown' })
  }
}

const clipPlugin: Plugin = {
  name: 'clip',
  description: '訊息書籤 (存/取/刪)',
  commands: [
    { name: 'save', description: '存訊息 (回覆+名稱)', handler: saveCommand },
    { name: 'recall', description: '叫回已存訊息 (名稱)', handler: recallCommand },
    { name: 'unsave', description: '刪除已存訊息 (名稱)', handler: unsaveCommand },
  ],
}

export default clipPlugin
