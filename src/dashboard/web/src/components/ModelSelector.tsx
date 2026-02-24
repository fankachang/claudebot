import { apiPost } from '../hooks/useApi'
import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import type { DashboardCommand } from '../types'

const MODELS = [
  { backend: 'claude', model: 'haiku', label: 'Haiku' },
  { backend: 'claude', model: 'sonnet', label: 'Sonnet' },
  { backend: 'claude', model: 'opus', label: 'Opus' },
  { backend: 'gemini', model: 'flash', label: 'Gemini Flash' },
  { backend: 'auto', model: 'auto', label: 'Auto' },
] as const

export function ModelSelector() {
  const { t } = useTranslation()
  const addCommand = useDashboardStore((s) => s.addCommand)

  const handleSwitch = async (backend: string, model: string) => {
    try {
      const data = await apiPost<{ command: DashboardCommand }>('/api/commands', {
        type: 'switch_model',
        payload: { backend, model },
      })
      addCommand(data.command)
    } catch {
      // silent
    }
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        padding: '4px 16px',
        marginBottom: '4px',
      }}>
        {t('model.title')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 12px' }}>
        {MODELS.map((m) => (
          <button
            key={`${m.backend}-${m.model}`}
            onClick={() => handleSwitch(m.backend, m.model)}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}
