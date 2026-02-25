/**
 * Parses @cmd() directives from Claude's response text.
 *
 * When Claude recognises that an existing bot command can fulfil a user's
 * request, it includes `@cmd(/schedule bitcoin 09:00)` in its reply.
 * The bot intercepts these directives and executes the commands on the
 * user's behalf, then strips the raw directives from the displayed text.
 */

export interface ParsedCommand {
  /** Full command string including leading slash, e.g. "/schedule bitcoin 09:00" */
  readonly command: string
  /** Just the command name without slash, e.g. "schedule" */
  readonly name: string
  /** Arguments after the command name, e.g. "bitcoin 09:00" */
  readonly args: string
  /** The raw matched text (for stripping) */
  readonly raw: string
}

const CMD_PATTERN = /^@cmd\(([^)]+)\)\s*$/gm

export function parseCommandDirectives(text: string): readonly ParsedCommand[] {
  const results: ParsedCommand[] = []

  CMD_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = CMD_PATTERN.exec(text)) !== null) {
    const full = match[1].trim()
    if (!full) continue

    // Ensure it starts with /
    const normalized = full.startsWith('/') ? full : `/${full}`
    const spaceIdx = normalized.indexOf(' ')

    const name = spaceIdx === -1
      ? normalized.slice(1)
      : normalized.slice(1, spaceIdx)

    const args = spaceIdx === -1
      ? ''
      : normalized.slice(spaceIdx + 1).trim()

    results.push({
      command: normalized,
      name,
      args,
      raw: match[0],
    })
  }

  return results
}

export function stripCommandDirectives(text: string): string {
  return text
    .replace(CMD_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
