import { useTranslation } from '../hooks/useTranslation'
import type { ActiveRunnerInfo, DashboardCommand } from '../types'

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remainder = s % 60
  return `${m}m${remainder}s`
}

// --- Queued Card ---

interface QueuedCardProps {
  readonly projectName: string
  readonly count: number
  readonly botId: string
}

export function QueuedCard({ projectName, count, botId }: QueuedCardProps) {
  const { t } = useTranslation()

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '12px',
      borderLeft: '3px solid var(--accent-yellow)',
    }}>
      <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>{projectName}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span>@{botId}</span>
        <span>{t('kanban.items', { n: count, s: count !== 1 ? 's' : '' })}</span>
      </div>
    </div>
  )
}

// --- Running Card (with progress bar) ---

interface RunningCardProps {
  readonly runner: ActiveRunnerInfo
  readonly botId: string
}

export function RunningCard({ runner, botId }: RunningCardProps) {
  const { t } = useTranslation()
  // Fake progress: cap at 90% based on tool count (real progress unknown)
  const progressPercent = Math.min(90, runner.toolCount * 5)

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '12px',
      borderLeft: '3px solid var(--accent-green)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontWeight: 500, fontSize: '14px' }}>{runner.projectName}</span>
        <span style={{
          fontSize: '10px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(63, 185, 80, 0.15)',
          color: 'var(--accent-green)',
          border: '1px solid rgba(63, 185, 80, 0.3)',
        }}>
          {runner.backend}/{runner.model}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height: '4px',
        background: 'var(--bg-hover)',
        borderRadius: '2px',
        marginBottom: '8px',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progressPercent}%`,
          background: 'var(--accent-green)',
          borderRadius: '2px',
          transition: 'width 0.5s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span>@{botId}</span>
        <span>{formatElapsed(runner.elapsedMs)}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>{t('runner.tools', { n: runner.toolCount })}</span>
        {runner.lastTool && <span>{t('runner.lastTool', { name: runner.lastTool })}</span>}
      </div>
    </div>
  )
}

// --- Done Card ---

interface DoneCardProps {
  readonly command: DashboardCommand
}

export function DoneCard({ command }: DoneCardProps) {
  const time = new Date(command.createdAt).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })

  const prompt = (command.payload.prompt as string) ?? command.type
  const isSuccess = command.status === 'completed'
  const borderColor = isSuccess ? 'var(--accent-blue)' : 'var(--accent-red)'
  const icon = isSuccess ? '\u2705' : '\u274C'

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      padding: '12px',
      borderLeft: `3px solid ${borderColor}`,
      opacity: 0.85,
    }}>
      <div style={{
        fontSize: '13px',
        marginBottom: '4px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {icon} {prompt}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>{time}</span>
        {command.claimedBy && <span>@{command.claimedBy}</span>}
      </div>
    </div>
  )
}
