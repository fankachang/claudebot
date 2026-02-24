import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import { BotCard, BotCardSkeleton } from './BotCard'

export function OverviewPanel() {
  const { t } = useTranslation()
  const bots = useDashboardStore((s) => s.bots)

  if (bots.length === 0) {
    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{t('overview.title')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          <BotCardSkeleton />
          <BotCardSkeleton />
        </div>
        <p style={{ color: 'var(--text-muted)', marginTop: '16px', fontSize: '14px' }}>
          {t('overview.waiting')}
        </p>
      </div>
    )
  }

  const onlineCount = bots.filter((b) => b.online).length
  const totalRunners = bots.reduce((n, b) => n + b.activeRunners.length, 0)
  const totalQueue = bots.reduce((n, b) => n + b.queueLength, 0)

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px' }}>{t('overview.title')}</h2>
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span>{t('overview.online', { a: onlineCount, b: bots.length })}</span>
          <span>{t('overview.active', { n: totalRunners })}</span>
          <span>{t('overview.queued', { n: totalQueue })}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {bots.map((bot) => (
          <BotCard key={bot.botId} bot={bot} />
        ))}
      </div>
    </div>
  )
}
