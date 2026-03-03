/**
 * Git worktree manager — enables multiple bot instances to work
 * on the same project simultaneously via isolated branches.
 *
 * Each bot with WORKTREE_BRANCH set gets its own worktree directory:
 *   C:\...\ClaudeBot  (master)
 *   C:\...\ClaudeBot--bot1  (worktree for bot1 branch)
 *   C:\...\ClaudeBot--bot5  (worktree for bot5 branch)
 *
 * Queue/lock/session systems automatically isolate because they
 * key on projectPath, which differs per worktree.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const GIT_TIMEOUT_MS = 30_000

interface WorktreeInfo {
  readonly worktreePath: string
  readonly branch: string
  readonly head: string
}

interface MergeResult {
  readonly success: boolean
  readonly message: string
  readonly conflicts?: readonly string[]
}

// --- Git helpers ---

function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', args as string[], {
    cwd,
    encoding: 'utf-8',
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
  }).trim()
}

/**
 * Compute the worktree directory path for a given project + branch.
 * Example: C:\code\ClaudeBot + "bot1" → C:\code\ClaudeBot--bot1
 */
export function worktreePath(projectPath: string, branch: string): string {
  const parent = dirname(projectPath)
  const name = basename(projectPath)
  return join(parent, `${name}--${branch}`)
}

/**
 * Check if a project directory is a git repository.
 */
export function isGitRepo(projectPath: string): boolean {
  try {
    git(['rev-parse', '--is-inside-work-tree'], projectPath)
    return true
  } catch {
    return false
  }
}

/**
 * List all worktrees for a git repository.
 */
export function listWorktrees(projectPath: string): readonly WorktreeInfo[] {
  try {
    const raw = git(['worktree', 'list', '--porcelain'], projectPath)
    if (!raw) return []

    const entries: WorktreeInfo[] = []
    let current: Partial<WorktreeInfo> = {}

    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.worktreePath) {
          entries.push(current as WorktreeInfo)
        }
        current = { worktreePath: line.slice(9) }
      } else if (line.startsWith('HEAD ')) {
        current = { ...current, head: line.slice(5) }
      } else if (line.startsWith('branch ')) {
        // "branch refs/heads/bot1" → "bot1"
        current = { ...current, branch: line.slice(7).replace('refs/heads/', '') }
      }
    }

    if (current.worktreePath) {
      entries.push(current as WorktreeInfo)
    }

    return entries
  } catch {
    return []
  }
}

/**
 * Find an existing worktree for a specific branch.
 */
export function findWorktree(
  projectPath: string,
  branch: string,
): WorktreeInfo | null {
  const trees = listWorktrees(projectPath)
  return trees.find((t) => t.branch === branch) ?? null
}

/**
 * Ensure a worktree exists for the given branch.
 * Creates the branch + worktree if they don't exist yet.
 * Returns the worktree directory path.
 */
export function ensureWorktree(
  projectPath: string,
  branch: string,
): string {
  const targetPath = worktreePath(projectPath, branch)

  // Already exists and is registered?
  const existing = findWorktree(projectPath, branch)
  if (existing && existsSync(existing.worktreePath)) {
    return existing.worktreePath
  }

  // Clean up stale worktree reference if directory was deleted
  if (existing && !existsSync(existing.worktreePath)) {
    try {
      git(['worktree', 'remove', existing.worktreePath, '--force'], projectPath)
    } catch {
      // prune will handle it
      git(['worktree', 'prune'], projectPath)
    }
  }

  // Check if branch exists
  const branchExists = branchExistsLocally(projectPath, branch)

  if (branchExists) {
    git(['worktree', 'add', targetPath, branch], projectPath)
  } else {
    // Create new branch from current HEAD
    git(['worktree', 'add', '-b', branch, targetPath], projectPath)
  }

  return targetPath
}

/**
 * Check if a local branch exists.
 */
function branchExistsLocally(projectPath: string, branch: string): boolean {
  try {
    git(['rev-parse', '--verify', `refs/heads/${branch}`], projectPath)
    return true
  } catch {
    return false
  }
}

/**
 * Get the current branch name in a worktree.
 */
export function currentBranch(worktreeDir: string): string {
  return git(['branch', '--show-current'], worktreeDir)
}

/**
 * Sync worktree branch with the main branch (rebase or merge).
 * Pulls latest from main into the worktree branch.
 */
export function syncFromMain(
  worktreeDir: string,
  mainBranch = 'master',
): MergeResult {
  try {
    const result = git(['merge', mainBranch, '--no-edit'], worktreeDir)
    return { success: true, message: result || 'Already up to date' }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    // Check for merge conflicts
    if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
      const conflictFiles = parseConflictFiles(worktreeDir)
      // Abort the failed merge
      try {
        git(['merge', '--abort'], worktreeDir)
      } catch { /* ignore */ }
      return {
        success: false,
        message: '合併衝突，已自動取消 merge',
        conflicts: conflictFiles,
      }
    }

    return { success: false, message: msg }
  }
}

/**
 * Merge worktree branch back into the main branch.
 * Operates from the MAIN repo directory (not the worktree).
 */
export function mergeToMain(
  projectPath: string,
  branch: string,
  mainBranch = 'master',
): MergeResult {
  try {
    // Ensure we're on main branch in the main worktree
    const current = currentBranch(projectPath)
    if (current !== mainBranch) {
      git(['checkout', mainBranch], projectPath)
    }

    const result = git(
      ['merge', branch, '--no-edit', '--no-ff'],
      projectPath,
    )

    return { success: true, message: result || `Merged ${branch} into ${mainBranch}` }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
      const conflictFiles = parseConflictFiles(projectPath)
      try {
        git(['merge', '--abort'], projectPath)
      } catch { /* ignore */ }
      return {
        success: false,
        message: `合併衝突 (${branch} → ${mainBranch})`,
        conflicts: conflictFiles,
      }
    }

    return { success: false, message: msg }
  }
}

/**
 * Remove a worktree and optionally delete its branch.
 */
export function removeWorktree(
  projectPath: string,
  branch: string,
  deleteBranch = false,
): void {
  const tree = findWorktree(projectPath, branch)
  if (tree) {
    try {
      git(['worktree', 'remove', tree.worktreePath, '--force'], projectPath)
    } catch {
      git(['worktree', 'prune'], projectPath)
    }
  }

  if (deleteBranch) {
    try {
      git(['branch', '-d', branch], projectPath)
    } catch {
      // Branch may not exist or has unmerged changes
    }
  }
}

/**
 * Check if a directory is inside a git worktree (not the main working tree).
 */
export function isWorktree(dir: string): boolean {
  try {
    const gitDir = git(['rev-parse', '--git-dir'], dir)
    // Worktrees have .git file pointing to main repo's .git/worktrees/<name>
    // Main repo has .git as a directory
    return gitDir.includes('worktrees')
  } catch {
    return false
  }
}

/**
 * Get the main repository path from a worktree directory.
 */
export function mainRepoPath(worktreeDir: string): string | null {
  try {
    const commonDir = git(['rev-parse', '--git-common-dir'], worktreeDir)
    // commonDir is like "C:/code/ClaudeBot/.git" — parent is the repo
    if (commonDir.endsWith('.git') || commonDir.endsWith('.git/')) {
      return dirname(commonDir.replace(/[/\\]$/, ''))
    }
    return dirname(commonDir)
  } catch {
    return null
  }
}

// --- Internal helpers ---

function parseConflictFiles(cwd: string): readonly string[] {
  try {
    const raw = git(['diff', '--name-only', '--diff-filter=U'], cwd)
    return raw ? raw.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}
