import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import type { ProjectInfo } from '../types'

export function ProjectPanel() {
  const { t } = useTranslation()
  const projects = useDashboardStore((s) => s.projects)
  const bots = useDashboardStore((s) => s.bots)
  const selectedProjectPath = useDashboardStore((s) => s.selectedProjectPath)

  if (!selectedProjectPath) return null

  const project = projects.find((p) => p.path === selectedProjectPath)
  if (!project) return null

  // Find which bots have runners on this project
  const activeOnProject = bots.flatMap((bot) =>
    bot.activeRunners
      .filter((r) => r.projectPath === selectedProjectPath)
      .map((r) => ({ ...r, botId: bot.botId }))
  )

  // Queue info from bots
  const queueInfo = bots
    .filter((bot) => {
      const count = bot.queueByProject[project.name]
      return count !== undefined && count > 0
    })
    .map((bot) => ({
      botId: bot.botId,
      count: bot.queueByProject[project.name] ?? 0,
    }))

  return (
    <div style={{
      padding: '24px',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px' }}>{project.name}</h2>
        {project.lockHolder && (
          <span style={{
            fontSize: '12px',
            padding: '3px 8px',
            borderRadius: '4px',
            background: 'rgba(210, 153, 34, 0.15)',
            color: 'var(--accent-yellow)',
            border: '1px solid rgba(210, 153, 34, 0.3)',
          }}>
            {t('project.lockedBy', { holder: project.lockHolder })}
          </span>
        )}
      </div>

      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
        {project.path}
      </div>

      {activeOnProject.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('project.activeRunners')}</h3>
          {activeOnProject.map((r) => (
            <div key={`${r.botId}-${r.projectPath}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px',
              background: 'var(--bg-card)',
              borderRadius: '6px',
              marginBottom: '4px',
              fontSize: '13px',
            }}>
              <span style={{ color: 'var(--accent-green)' }}>{r.botId}</span>
              <span style={{ color: 'var(--text-muted)' }}>{r.backend}/{r.model}</span>
              <span>{formatElapsed(r.elapsedMs)}</span>
              <span style={{ color: 'var(--text-muted)' }}>{t('runner.tools', { n: r.toolCount })}</span>
            </div>
          ))}
        </div>
      )}

      {queueInfo.length > 0 && (
        <div>
          <h3 style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('project.queue')}</h3>
          {queueInfo.map((q) => (
            <div key={q.botId} style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '4px 0' }}>
              {q.botId}: {t('project.items', { n: q.count, s: q.count !== 1 ? 's' : '' })}
            </div>
          ))}
        </div>
      )}

      {activeOnProject.length === 0 && queueInfo.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
          {t('project.noActivity')}
        </div>
      )}
    </div>
  )
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remainder = s % 60
  return `${m}m${remainder}s`
}
