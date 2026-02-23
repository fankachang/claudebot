import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ProjectInfo } from '../types/index.js'
import { env } from './env.js'

export function getBaseDirs(): readonly string[] {
  return env.PROJECTS_BASE_DIR.map((d) => resolve(d))
}

export function scanProjects(): readonly ProjectInfo[] {
  const results: ProjectInfo[] = []

  for (const baseDir of getBaseDirs()) {
    try {
      const entries = readdirSync(baseDir)
      for (const entry of entries) {
        const fullPath = join(baseDir, entry)
        try {
          if (statSync(fullPath).isDirectory() && !entry.startsWith('.')) {
            results.push({ name: entry, path: fullPath })
          }
        } catch {
          // skip inaccessible entries
        }
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to scan projects directory "${baseDir}": ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return results
}

export function findProject(query: string): ProjectInfo | null {
  const projects = scanProjects()
  const q = query.toLowerCase().trim()

  // 1. Exact match
  const exact = projects.find((p) => p.name.toLowerCase() === q)
  if (exact) return exact

  // 2. Path fragment match (e.g., "Desktop/code/weetube" or "C:\Users\...\weetube")
  const normalized = q.replace(/\\/g, '/')
  const byPath = projects.find((p) => p.path.replace(/\\/g, '/').toLowerCase().endsWith(normalized))
  if (byPath) return byPath

  // 3. Starts-with match (e.g., "wee" → "weetube")
  const startsWith = projects.filter((p) => p.name.toLowerCase().startsWith(q))
  if (startsWith.length === 1) return startsWith[0]

  // 4. Contains match (e.g., "tube" → "weetube")
  const contains = projects.filter((p) => p.name.toLowerCase().includes(q))
  if (contains.length === 1) return contains[0]

  return null
}
