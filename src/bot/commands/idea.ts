import type { BotContext } from '../../types/context.js'
import { addIdea, getAllIdeas, getIdeasByTag, getIdeaStats } from '../idea-store.js'

export async function ideaCommand(ctx: BotContext): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text ?? '' : ''
  const content = text.replace(/^\/idea\s*/, '').trim()

  if (!content) {
    await ctx.reply(
      '用法: `/idea <內容> #標籤`\n\n' +
      '範例:\n' +
      '`/idea 做一個自動字幕工具 #dev`\n' +
      '`/idea 週五買牛奶 #life`\n' +
      '`/idea 訂閱制 AI 配音 #biz`\n\n' +
      '標籤可選: `#dev` `#life` `#biz` 或自訂',
      { parse_mode: 'Markdown' },
    )
    return
  }

  const idea = addIdea(content)
  const tagDisplay = idea.tags.length > 0
    ? ` (${idea.tags.map((t) => `#${t}`).join(' ')})`
    : ''

  await ctx.reply(`✨ 已記錄靈感${tagDisplay}\n\n${idea.text}`)
}

export async function ideasCommand(ctx: BotContext): Promise<void> {
  const text = (ctx.message && 'text' in ctx.message) ? ctx.message.text ?? '' : ''
  const arg = text.replace(/^\/ideas\s*/, '').trim()

  // /ideas #tag — filter by tag
  if (arg.startsWith('#')) {
    const tag = arg.slice(1)
    const filtered = getIdeasByTag(tag)

    if (filtered.length === 0) {
      await ctx.reply(`沒有 #${tag} 的靈感。`)
      return
    }

    const lines = filtered.map((idea) => `• ${idea.text}  _${idea.date}_`)
    await ctx.reply(
      `💡 *#${tag}* (${filtered.length})\n\n${lines.join('\n')}`,
      { parse_mode: 'Markdown' },
    )
    return
  }

  // /ideas stats — show tag stats
  if (arg === 'stats') {
    const stats = getIdeaStats()
    if (stats.total === 0) {
      await ctx.reply('還沒有任何靈感。用 `/idea` 開始記錄！', { parse_mode: 'Markdown' })
      return
    }

    const lines = Object.entries(stats)
      .filter(([key]) => key !== 'total')
      .sort(([, a], [, b]) => b - a)
      .map(([tag, count]) => `  #${tag}: ${count}`)

    await ctx.reply(
      `📊 *靈感統計* (共 ${stats.total} 則)\n\n${lines.join('\n')}`,
      { parse_mode: 'Markdown' },
    )
    return
  }

  // /ideas — show recent (last 10)
  const all = getAllIdeas()

  if (all.length === 0) {
    await ctx.reply('還沒有任何靈感。用 `/idea` 開始記錄！', { parse_mode: 'Markdown' })
    return
  }

  const recent = all.slice(0, 10)
  const lines = recent.map((idea) => {
    const tags = idea.tags.length > 0 ? ` ${idea.tags.map((t) => `#${t}`).join(' ')}` : ''
    return `• ${idea.text}${tags}  _${idea.date}_`
  })

  const moreText = all.length > 10 ? `\n\n_...共 ${all.length} 則，用 \`/ideas #tag\` 篩選_` : ''

  await ctx.reply(
    `💡 *靈感筆記* (最近 ${recent.length} 則)\n\n${lines.join('\n')}${moreText}`,
    { parse_mode: 'Markdown' },
  )
}
