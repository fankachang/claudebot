import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import { QueuedCard, RunningCard, DoneCard } from './KanbanCard'

const COLUMN_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: '240px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const COLUMN_HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '4px',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
}

function CountBadge({ count, color }: { count: number; color: string }) {
  if (count === 0) return null
  return (
    <span style={{
      fontSize: '11px',
      padding: '1px 6px',
      borderRadius: '10px',
      background: `${color}20`,
      color,
      fontWeight: 500,
    }}>
      {count}
    </span>
  )
}

export function KanbanBoard() {
  const { t } = useTranslation()
  const bots = useDashboardStore((s) => s.bots)
  const commands = useDashboardStore((s) => s.commands)

  // Aggregate queued items across all bots
  const queuedItems: { projectName: string; count: number; botId: string }[] = []
  for (const bot of bots) {
    if (!bot.online) continue
    for (const [projectName, count] of Object.entries(bot.queueByProject)) {
      if (count > 0) {
        queuedItems.push({ projectName, count, botId: bot.botId })
      }
    }
  }

  // Aggregate running items across all bots
  const runningItems: { runner: (typeof bots)[number]['activeRunners'][number]; botId: string }[] = []
  for (const bot of bots) {
    if (!bot.online) continue
    for (const runner of bot.activeRunners) {
      runningItems.push({ runner, botId: bot.botId })
    }
  }

  // Recent completed/failed commands (last 10)
  const doneItems = commands
    .filter((c) => c.status === 'completed' || c.status === 'failed')
    .slice(-10)
    .reverse()

  return (
    <div style={{ padding: '24px', borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>{t('kanban.title')}</h2>
      <div style={{ display: 'flex', gap: '16px', overflowX: 'auto' }}>
        {/* QUEUED column */}
        <div style={COLUMN_STYLE}>
          <div style={COLUMN_HEADER_STYLE}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-yellow)' }} />
            {t('kanban.queued')}
            <CountBadge count={queuedItems.length} color="var(--accent-yellow)" />
          </div>
          {queuedItems.map((item) => (
            <QueuedCard
              key={`${item.botId}-${item.projectName}`}
              projectName={item.projectName}
              count={item.count}
              botId={item.botId}
            />
          ))}
          {queuedItems.length === 0 && (
            <EmptyColumn text={t('kanban.noQueued')} />
          )}
        </div>

        {/* RUNNING column */}
        <div style={COLUMN_STYLE}>
          <div style={COLUMN_HEADER_STYLE}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--accent-green)',
              boxShadow: '0 0 6px var(--accent-green)',
            }} />
            {t('kanban.running')}
            <CountBadge count={runningItems.length} color="var(--accent-green)" />
          </div>
          {runningItems.map((item) => (
            <RunningCard
              key={`${item.botId}-${item.runner.projectPath}`}
              runner={item.runner}
              botId={item.botId}
            />
          ))}
          {runningItems.length === 0 && (
            <EmptyColumn text={t('kanban.allIdle')} />
          )}
        </div>

        {/* DONE column */}
        <div style={COLUMN_STYLE}>
          <div style={COLUMN_HEADER_STYLE}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-blue)' }} />
            {t('kanban.done')}
            <CountBadge count={doneItems.length} color="var(--accent-blue)" />
          </div>
          {doneItems.map((cmd) => (
            <DoneCard key={cmd.id} command={cmd} />
          ))}
          {doneItems.length === 0 && (
            <EmptyColumn text={t('kanban.noDone')} />
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyColumn({ text }: { text: string }) {
  return (
    <div style={{
      padding: '24px 12px',
      textAlign: 'center',
      color: 'var(--text-muted)',
      fontSize: '12px',
      fontStyle: 'italic',
      border: '1px dashed var(--border)',
      borderRadius: '6px',
    }}>
      {text}
    </div>
  )
}
