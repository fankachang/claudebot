import { apiPost } from '../hooks/useApi'
import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import type { DashboardCommand } from '../types'

interface TemplateDef {
  readonly labelKey: 'templates.codeReview' | 'templates.fixBug' | 'templates.newFeature' | 'templates.refactor' | 'templates.writeTests'
  readonly prompt: string
  readonly color: string
}

const TEMPLATES: readonly TemplateDef[] = [
  {
    labelKey: 'templates.codeReview',
    prompt: 'Review the recent changes for bugs, security issues, and code quality. Focus on critical issues only.',
    color: 'var(--accent-blue)',
  },
  {
    labelKey: 'templates.fixBug',
    prompt: 'Investigate and fix the following bug: ',
    color: 'var(--accent-red)',
  },
  {
    labelKey: 'templates.newFeature',
    prompt: 'Implement the following feature: ',
    color: 'var(--accent-green)',
  },
  {
    labelKey: 'templates.refactor',
    prompt: 'Refactor the following code for better readability and maintainability: ',
    color: 'var(--accent-purple)',
  },
  {
    labelKey: 'templates.writeTests',
    prompt: 'Write comprehensive tests for the recently changed files. Target 80%+ coverage.',
    color: 'var(--accent-yellow)',
  },
]

export function PromptTemplates() {
  const { t } = useTranslation()
  const addCommand = useDashboardStore((s) => s.addCommand)

  const handleTemplate = async (template: TemplateDef) => {
    // If prompt ends with ": " it needs user input — just partial send
    if (template.prompt.endsWith(': ')) {
      // Focus the command input and pre-fill (via store)
      useDashboardStore.getState().setDraftPrompt(template.prompt)
      return
    }

    try {
      const data = await apiPost<{ command: DashboardCommand }>('/api/commands', {
        type: 'prompt',
        payload: { prompt: template.prompt },
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
        {t('templates.title')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '0 12px' }}>
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.labelKey}
            onClick={() => handleTemplate(tmpl)}
            title={tmpl.prompt}
            style={{
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 500,
              background: 'var(--bg-card)',
              border: `1px solid ${tmpl.color}33`,
              borderLeft: `3px solid ${tmpl.color}`,
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
            }}
          >
            {t(tmpl.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
