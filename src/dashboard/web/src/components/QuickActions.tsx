import { apiPost } from '../hooks/useApi'
import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import type { DashboardCommand } from '../types'

interface ActionDef {
  readonly labelKey: 'actions.cancelAll' | 'actions.newSession'
  readonly type: DashboardCommand['type']
  readonly payload: Record<string, unknown>
  readonly color: string
}

const ACTIONS: readonly ActionDef[] = [
  { labelKey: 'actions.cancelAll', type: 'cancel', payload: {}, color: 'var(--accent-red)' },
  { labelKey: 'actions.newSession', type: 'new_session', payload: {}, color: 'var(--accent-purple)' },
]

export function QuickActions() {
  const { t } = useTranslation()
  const addCommand = useDashboardStore((s) => s.addCommand)

  const handleAction = async (action: ActionDef) => {
    try {
      const data = await apiPost<{ command: DashboardCommand }>('/api/commands', {
        type: action.type,
        payload: action.payload,
      })
      addCommand(data.command)
    } catch {
      // silent
    }
  }

  return (
    <div>
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        padding: '4px 16px',
        marginBottom: '4px',
      }}>
        {t('actions.title')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
        {ACTIONS.map((action) => (
          <button
            key={action.labelKey}
            onClick={() => handleAction(action)}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'var(--bg-card)',
              border: `1px solid ${action.color}33`,
              borderRadius: '4px',
              color: action.color,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {t(action.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
