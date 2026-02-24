import { useTranslation } from '../hooks/useTranslation'
import type { ActiveRunnerInfo } from '../types'

interface RunnerCardProps {
  readonly runner: ActiveRunnerInfo
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remainder = s % 60
  return `${m}m${remainder}s`
}

export function RunnerCard({ runner }: RunnerCardProps) {
  const { t } = useTranslation()

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      borderRadius: '6px',
      padding: '10px',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 500, fontSize: '14px', color: 'var(--accent-blue)' }}>
          {runner.projectName}
        </span>
        <span style={{
          fontSize: '11px',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'var(--bg-hover)',
          color: 'var(--text-secondary)',
        }}>
          {runner.backend}/{runner.model}
        </span>
      </div>
      <div style={{
        display: 'flex',
        gap: '12px',
        marginTop: '6px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        <span>{formatElapsed(runner.elapsedMs)}</span>
        <span>{t('runner.tools', { n: runner.toolCount })}</span>
        {runner.lastTool && <span>{t('runner.lastTool', { name: runner.lastTool })}</span>}
      </div>
    </div>
  )
}
