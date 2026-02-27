interface ChoiceEntry {
  readonly projectPath: string
  readonly choices: readonly string[]
  readonly timestamp: number
}

const store = new Map<string, ChoiceEntry>()

function key(chatId: number, projectPath: string): string {
  return `${chatId}:${projectPath}`
}

export function setChoices(
  chatId: number,
  projectPath: string,
  choices: readonly string[],
): void {
  store.set(key(chatId, projectPath), {
    projectPath,
    choices,
    timestamp: Date.now(),
  })
}

export function getChoice(
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
  return entry.choices[index] ?? null
}

export function clearChoices(chatId: number, projectPath: string): void {
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
