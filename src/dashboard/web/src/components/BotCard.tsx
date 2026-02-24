import type { BotHeartbeat } from '../types'
import { useTranslation } from '../hooks/useTranslation'
import { RunnerCard } from './RunnerCard'

interface BotCardProps {
  readonly bot: BotHeartbeat
}

export function BotCard({ bot }: BotCardProps) {
  const { t } = useTranslation()
  const isActive = bot.activeRunners.length > 0
  const statusColor = !bot.online
    ? 'var(--text-muted)'
    : isActive
      ? 'var(--accent-green)'
      : 'var(--accent-yellow)'

  const statusLabel = !bot.online
    ? t('bot.offline')
    : isActive
      ? t('bot.running')
      : t('bot.idle')

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      minWidth: '260px',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: statusColor,
            display: 'inline-block',
            boxShadow: bot.online && isActive ? `0 0 6px ${statusColor}` : 'none',
          }} />
          <span style={{ fontWeight: 600, fontSize: '16px' }}>{bot.botId}</span>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{statusLabel}</span>
      </div>

      {bot.activeRunners.map((runner) => (
        <RunnerCard key={runner.projectPath} runner={runner} />
      ))}

      {!isActive && bot.online && (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
          {t('bot.noTasks')}
        </div>
      )}

      {!bot.online && (
        <div style={{ color: 'var(--accent-red)', fontSize: '13px' }}>
          {t('bot.heartbeatExpired')}
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '12px',
        paddingTop: '8px',
        borderTop: '1px solid var(--border)',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        <span>{t('bot.queue')}: {bot.queueLength}</span>
        <span>PID: {bot.pid}</span>
      </div>
    </div>
  )
}

export function BotCardSkeleton() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      minWidth: '260px',
      opacity: 0.5,
    }}>
      <div style={{ height: '24px', background: 'var(--bg-hover)', borderRadius: '4px', marginBottom: '12px', width: '60%' }} />
      <div style={{ height: '40px', background: 'var(--bg-hover)', borderRadius: '4px' }} />
    </div>
  )
}
