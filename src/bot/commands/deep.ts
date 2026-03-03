/**
 * /deep — Deep analysis mode with opus model and extended turns.
 *
 * Usage:
 *   /deep 分析這個專案的效能瓶頸
 *   /deep review src/bot/
 *   /deep 這個 bug 的 root cause 是什麼
 */

import type { BotContext } from '../../types/context.js'
import { getUserState } from '../state.js'
import { resolveBackend } from '../../ai/types.js'
import { getAISessionId } from '../../ai/session-store.js'
import { enqueue } from '../../claude/queue.js'
import { env } from '../../config/env.js'

const DEEP_PREFIX =
  '[深度分析模式]\n' +
  '這是一個需要深入分析的任務。請：\n' +
  '1. 使用 Task tool spawn subagent 從多個角度分析（搜尋、安全、效能、架構）\n' +
  '2. 先全面理解問題再給結論\n' +
  '3. 提供詳細、有結構的報告\n' +
  '4. 不要怕花時間 — 品質優先\n\n'

/** Deep mode uses 2x the configured MAX_TURNS, or 30 if no limit set. */
function getDeepMaxTurns(): number {
  const base = env.MAX_TURNS ?? 15
  return base * 2
}

export async function deepCommand(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id
  if (!chatId) return

  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
  const prompt = text.replace(/^\/deep\s*/i, '').trim()

  if (!prompt) {
    await ctx.reply(
      '🔬 *深度分析模式*\n\n' +
      '用法: `/deep <你的問題>`\n\n' +
      '範例:\n' +
      '`/deep 分析這個專案的效能瓶頸`\n' +
      '`/deep review src/bot/`\n' +
      '`/deep 這個 bug 的 root cause`\n\n' +
      '_使用 opus 模型 + 加倍 turns + 多角度 subagent 分析_',
      { parse_mode: 'Markdown' },
    )
    return
  }

  const threadId = ctx.message && 'message_thread_id' in ctx.message
    ? ctx.message.message_thread_id
    : undefined

  const state = getUserState(chatId, threadId)

  if (!state.selectedProject) {
    await ctx.reply('請先用 /projects 選擇專案')
    return
  }

  const project = state.selectedProject
  const deepAI = { backend: 'claude' as const, model: 'opus' }
  const sessionId = getAISessionId(resolveBackend(deepAI.backend), project.path)

  enqueue({
    chatId,
    prompt: DEEP_PREFIX + prompt,
    project,
    ai: deepAI,
    sessionId,
    imagePaths: [],
    maxTurns: getDeepMaxTurns(),
  })

  await ctx.reply(
    `🔬 *[${project.name}]* 深度分析中... (opus)\n_${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}_`,
    { parse_mode: 'Markdown' },
  )
}
