import type { Plugin, OutputMetadata, OutputHookResult } from '../../types/plugin.js'
import type { BotContext } from '../../types/context.js'

let enabled = true
let totalConversions = 0

// --- Core GFM → Telegram Markdown conversion ---

export function convertGfmToTelegram(text: string): { text: string; changed: boolean } {
  // 1. Extract code blocks — protect from transformation
  const codeBlocks: string[] = []
  let result = text.replace(/```[\s\S]*?```/g, (match) => {
    // Strip language tag (Telegram Markdown v1 doesn't support it)
    const cleaned = match.replace(/^```\w*\n/, '```\n')
    codeBlocks.push(cleaned)
    return `\x00CB${codeBlocks.length - 1}\x00`
  })

  // 2. Extract inline code — protect from transformation
  const inlineCodes: string[] = []
  result = result.replace(/`[^`\n]+`/g, (match) => {
    inlineCodes.push(match)
    return `\x00IC${inlineCodes.length - 1}\x00`
  })

  // 3. Apply transformations to non-code text

  // Horizontal rules (before bold, since *** on its own line = HR not bold)
  result = result.replace(/^\s*[-]{3,}\s*$/gm, '━━━━━━━━━━━━━━━━━━')
  result = result.replace(/^\s*[*]{3,}\s*$/gm, '━━━━━━━━━━━━━━━━━━')

  // Headers → bold (strip inner bold markers to avoid ***double wrap***)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, (_, content) => {
    const clean = content.replace(/\*+/g, '').trim()
    return `*${clean}*`
  })

  // Bold+italic: ***text*** → *text*
  result = result.replace(/\*{3}(.+?)\*{3}/g, '*$1*')

  // Bold: **text** → *text*  (THE biggest visual win)
  result = result.replace(/\*{2}(.+?)\*{2}/g, '*$1*')

  // Blockquotes
  result = result.replace(/^>\s?(.*)$/gm, '┃ $1')

  // Task lists
  result = result.replace(/^(\s*)- \[ \]\s/gm, '$1☐ ')
  result = result.replace(/^(\s*)- \[x\]\s/gim, '$1☑ ')

  // 4. Safety: fix common unbalanced marker issues
  // Count unescaped * outside placeholders — if odd, escape the last one
  result = fixUnbalancedMarkers(result, '*')
  result = fixUnbalancedMarkers(result, '_')

  // 5. Restore placeholders
  result = result.replace(/\x00IC(\d+)\x00/g, (_, idx) => inlineCodes[Number(idx)])
  result = result.replace(/\x00CB(\d+)\x00/g, (_, idx) => codeBlocks[Number(idx)])

  return { text: result, changed: result !== text }
}

function fixUnbalancedMarkers(text: string, marker: string): string {
  // Skip placeholders when counting
  const cleaned = text.replace(/\x00(CB|IC)\d+\x00/g, '')
  let count = 0
  for (const ch of cleaned) {
    if (ch === marker) count++
  }
  if (count % 2 === 0) return text

  // Odd count — escape the last unmatched marker to prevent Telegram parse error
  const lastIdx = text.lastIndexOf(marker)
  if (lastIdx === -1) return text
  return text.slice(0, lastIdx) + '\\' + marker + text.slice(lastIdx + 1)
}

// --- Output hook ---

async function onOutput(text: string, _meta: OutputMetadata): Promise<OutputHookResult> {
  if (!enabled) {
    return { text, modified: false }
  }

  const { text: converted, changed } = convertGfmToTelegram(text)

  if (!changed) {
    return { text, modified: false }
  }

  totalConversions++
  return { text: converted, modified: true }
}

// --- Commands ---

async function mdfixCommand(ctx: BotContext): Promise<void> {
  const args = (ctx.message && 'text' in ctx.message ? ctx.message.text : '').split(/\s+/).slice(1)
  const sub = args[0]

  if (sub === 'on') {
    enabled = true
    await ctx.reply('Markdown 修正已啟用')
    return
  }

  if (sub === 'off') {
    enabled = false
    await ctx.reply('Markdown 修正已停用（回應將顯示原始 Markdown）')
    return
  }

  if (sub === 'test') {
    const sample = [
      '### 功能清單',
      '',
      '這段有 **粗體文字** 和 `inline code`。',
      '',
      '- [ ] 未完成的任務',
      '- [x] 已完成的任務',
      '',
      '> 這是引用區塊',
      '',
      '---',
      '',
      '```typescript',
      'const greeting = "Hello World"',
      'console.log(greeting)',
      '```',
    ].join('\n')

    await ctx.reply('📝 *轉換前*（原始 GFM）:', { parse_mode: 'Markdown' })
    await ctx.reply(sample)

    const { text: converted } = convertGfmToTelegram(sample)
    await ctx.reply('✨ *轉換後*（Telegram 渲染）:', { parse_mode: 'Markdown' })
    try {
      await ctx.reply(converted, { parse_mode: 'Markdown' })
    } catch {
      await ctx.reply(converted)
    }
    return
  }

  const status = enabled ? '啟用中' : '已停用'
  await ctx.reply(
    `*mdfix — Markdown 自動修正*\n\n` +
    `狀態：${status}\n` +
    `累計轉換：${totalConversions} 次\n\n` +
    `轉換項目：\n` +
    `  \`**bold**\` → *bold*\n` +
    `  \`### Header\` → *Header*\n` +
    `  \`---\` → ━━━━━━\n` +
    `  \`> quote\` → ┃ quote\n` +
    `  \`- [ ]\` → ☐ / ☑\n` +
    `  程式碼語言標籤自動移除\n\n` +
    `用法：\n` +
    `  /mdfix on — 啟用\n` +
    `  /mdfix off — 停用\n` +
    `  /mdfix test — 看 before/after`,
    { parse_mode: 'Markdown' },
  )
}

// --- Plugin export ---

const plugin: Plugin = {
  name: 'mdfix',
  description: 'GFM → Telegram Markdown 自動轉換',
  commands: [
    { name: 'mdfix', description: 'Markdown 修正設定', handler: mdfixCommand },
  ],
  onOutput,
}

export default plugin
