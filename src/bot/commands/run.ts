import type { BotContext } from '../../types/context.js'
import { findProject } from '../../config/projects.js'
import { getSessionId } from '../../claude/session-store.js'
import { enqueue, isProcessing, getQueueLength } from '../../claude/queue.js'
import { getUserState } from '../state.js'

export async function runCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const raw = (ctx.message && 'text' in ctx.message) ? ctx.message.text ?? '' : ''
  const rest = raw.replace(/^\/run\s*/, '').trim()

  if (!rest) {
    await ctx.reply(
      '用法: `/run <專案> <提示>`\n範例: `/run weetube 更新 API endpoint`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  // First word is project name, rest is prompt
  const spaceIdx = rest.indexOf(' ')
  if (spaceIdx === -1) {
    await ctx.reply(
      '❌ 請提供提示內容。\n用法: `/run <專案> <提示>`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const projectName = rest.slice(0, spaceIdx).trim()
  const prompt = rest.slice(spaceIdx + 1).trim()

  if (!prompt) {
    await ctx.reply(
      '❌ 請提供提示內容。\n用法: `/run <專案> <提示>`',
      { parse_mode: 'Markdown' }
    )
    return
  }

  const project = findProject(projectName)
  if (!project) {
    await ctx.reply(`❌ 找不到專案 "${projectName}"。用 /projects 查看可用專案。`)
    return
  }

  const threadId = ctx.message && 'message_thread_id' in ctx.message
    ? ctx.message.message_thread_id
    : undefined
  const state = getUserState(chatId, threadId)
  const model = state.model
  const sessionId = getSessionId(project.path)

  enqueue({
    chatId,
    prompt,
    project,
    model,
    sessionId,
    imagePaths: [],
  })

  const busy = isProcessing(project.path)
  const qLen = getQueueLength(project.path)

  if (busy) {
    await ctx.reply(
      `📤 [${project.name}] 已加入佇列 (前方 ${qLen} 個)\n提示: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`
    )
  } else {
    await ctx.reply(
      `🚀 [${project.name}] 跨專案執行中\n提示: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`
    )
  }
}
