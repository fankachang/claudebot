interface SuggestionEntry {
  readonly projectPath: string
  readonly suggestions: readonly string[]
  readonly timestamp: number
}

const store = new Map<string, SuggestionEntry>()

function key(chatId: number, projectPath: string): string {
  return `${chatId}:${projectPath}`
}

export function setSuggestions(
  chatId: number,
  projectPath: string,
  suggestions: readonly string[],
): void {
  store.set(key(chatId, projectPath), {
    projectPath,
    suggestions,
    timestamp: Date.now(),
  })
}

export function getSuggestion(
  chatId: number,
  projectPath: string,
  index: number,
): string | null {
  const entry = store.get(key(chatId, projectPath))
  if (!entry) return null
  // Expire after 10 minutes
  if (Date.now() - entry.timestamp > 10 * 60_000) {
    store.delete(key(chatId, projectPath))
    return null
  }
  return entry.suggestions[index] ?? null
}

export function clearSuggestions(chatId: number, projectPath: string): void {
  store.delete(key(chatId, projectPath))
}

// Periodic cleanup of expired entries
const EXPIRY_MS = 10 * 60_000
setInterval(() => {
  const now = Date.now()
  for (const [k, entry] of store) {
    if (now - entry.timestamp > EXPIRY_MS) store.delete(k)
  }
}, 60_000)
