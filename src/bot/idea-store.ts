/**
 * Idea store — Markdown-based idea/inspiration storage.
 * Ideas are stored in `data/ideas.md` as a date-grouped Markdown file,
 * making them easy to browse with any MD editor (e.g. MDMan).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const IDEAS_PATH = resolve('data/ideas.md')

export interface Idea {
  readonly text: string
  readonly tags: readonly string[]
  readonly date: string // YYYY-MM-DD
  readonly time: string // HH:MM
}

function ensureDir(): void {
  const dir = dirname(IDEAS_PATH)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function loadRaw(): string {
  try {
    return readFileSync(IDEAS_PATH, 'utf-8')
  } catch {
    return ''
  }
}

function saveRaw(content: string): void {
  ensureDir()
  writeFileSync(IDEAS_PATH, content, 'utf-8')
}

/**
 * Parse tags from idea text. Tags start with # and are alphanumeric or Chinese.
 * Returns { cleanText, tags }.
 */
function extractTags(text: string): { readonly cleanText: string; readonly tags: readonly string[] } {
  const tagPattern = /#([\w\u4e00-\u9fff]+)/g
  const tags: string[] = []
  let match: RegExpExecArray | null

  tagPattern.lastIndex = 0
  while ((match = tagPattern.exec(text)) !== null) {
    tags.push(match[1])
  }

  const cleanText = text.replace(tagPattern, '').trim()
  return { cleanText, tags }
}

/**
 * Determine icon based on tags.
 */
function getIcon(tags: readonly string[]): string {
  if (tags.some((t) => ['dev', 'code', '開發', '技術'].includes(t))) return '💡'
  if (tags.some((t) => ['biz', 'business', '商業', '生意'].includes(t))) return '💼'
  if (tags.some((t) => ['life', '生活', '備忘'].includes(t))) return '📝'
  return '✨'
}

/**
 * Add a new idea to the Markdown file.
 */
export function addIdea(rawText: string): Idea {
  const { cleanText, tags } = extractTags(rawText)
  const now = new Date()
  const date = now.toLocaleDateString('sv-SE') // YYYY-MM-DD
  const time = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Taipei',
  })

  const icon = getIcon(tags)
  const tagSuffix = tags.length > 0 ? ` ${tags.map((t) => `#${t}`).join(' ')}` : ''

  const existing = loadRaw()
  const dateSectionHeader = `## ${date}`
  const newEntry = `### ${icon} ${cleanText}${tagSuffix}\n_${time}_\n`

  let updated: string

  if (existing.includes(dateSectionHeader)) {
    // Append under existing date section
    const insertPoint = existing.indexOf(dateSectionHeader) + dateSectionHeader.length
    const beforeInsert = existing.slice(0, insertPoint)
    const afterInsert = existing.slice(insertPoint)
    updated = `${beforeInsert}\n\n${newEntry}${afterInsert}`
  } else {
    // Create new date section at the top (after title)
    if (existing.trim() === '') {
      updated = `# Ideas\n\n${dateSectionHeader}\n\n${newEntry}`
    } else {
      // Insert after "# Ideas" header
      const titleEnd = existing.indexOf('\n')
      if (titleEnd === -1) {
        updated = `${existing}\n\n${dateSectionHeader}\n\n${newEntry}`
      } else {
        const title = existing.slice(0, titleEnd)
        const rest = existing.slice(titleEnd)
        updated = `${title}\n\n${dateSectionHeader}\n\n${newEntry}${rest}`
      }
    }
  }

  saveRaw(updated)

  return { text: cleanText, tags, date, time }
}

/**
 * Parse all ideas from the Markdown file.
 */
export function getAllIdeas(): readonly Idea[] {
  const content = loadRaw()
  if (!content.trim()) return []

  const ideas: Idea[] = []
  let currentDate = ''

  for (const line of content.split('\n')) {
    const dateMatch = line.match(/^## (\d{4}-\d{2}-\d{2})/)
    if (dateMatch) {
      currentDate = dateMatch[1]
      continue
    }

    const ideaMatch = line.match(/^### [^\s]+ (.+)/)
    if (ideaMatch && currentDate) {
      const { cleanText, tags } = extractTags(ideaMatch[1])
      ideas.push({ text: cleanText, tags, date: currentDate, time: '' })
    }
  }

  return ideas
}

/**
 * Get ideas filtered by tag.
 */
export function getIdeasByTag(tag: string): readonly Idea[] {
  return getAllIdeas().filter((idea) =>
    idea.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
  )
}

/**
 * Count ideas grouped by tag.
 */
export function getIdeaStats(): Record<string, number> {
  const ideas = getAllIdeas()
  const stats: Record<string, number> = { total: ideas.length }

  for (const idea of ideas) {
    for (const tag of idea.tags) {
      stats[tag] = (stats[tag] ?? 0) + 1
    }
    if (idea.tags.length === 0) {
      stats['untagged'] = (stats['untagged'] ?? 0) + 1
    }
  }

  return stats
}
