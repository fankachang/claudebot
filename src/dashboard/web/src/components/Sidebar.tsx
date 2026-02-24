import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import { ModelSelector } from './ModelSelector'
import { QuickActions } from './QuickActions'
import { PromptTemplates } from './PromptTemplates'
import type { BotHeartbeat, ProjectInfo } from '../types'

export function Sidebar() {
  const { t } = useTranslation()
  const bots = useDashboardStore((s) => s.bots)
  const projects = useDashboardStore((s) => s.projects)
  const selectedBotId = useDashboardStore((s) => s.selectedBotId)
  const setSelectedBotId = useDashboardStore((s) => s.setSelectedBotId)

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      height: '100vh',
      overflowY: 'auto',
      flexShrink: 0,
      padding: '12px 0',
    }}>
      <SidebarSection title={t('sidebar.bots')}>
        {bots.map((bot) => (
          <BotItem
            key={bot.botId}
            bot={bot}
            selected={selectedBotId === bot.botId}
            onClick={() => setSelectedBotId(
              selectedBotId === bot.botId ? null : bot.botId
            )}
          />
        ))}
        {bots.length === 0 && (
          <div style={{ padding: '4px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
            {t('sidebar.noBots')}
          </div>
        )}
      </SidebarSection>

      <SidebarSection title={t('sidebar.projects')}>
        {projects.map((project) => (
          <ProjectItem key={project.path} project={project} />
        ))}
      </SidebarSection>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
        <PromptTemplates />
        <ModelSelector />
        <QuickActions />
      </div>
    </aside>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        padding: '4px 16px',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function BotItem({
  bot,
  selected,
  onClick,
}: {
  bot: BotHeartbeat
  selected: boolean
  onClick: () => void
}) {
  const isActive = bot.activeRunners.length > 0
  const dotColor = !bot.online
    ? 'var(--text-muted)'
    : isActive
      ? 'var(--accent-green)'
      : 'var(--accent-yellow)'

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '6px 16px',
        border: 'none',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: '13px',
        textAlign: 'left',
      }}
    >
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: dotColor,
        flexShrink: 0,
      }} />
      <span>{bot.botId}</span>
      {bot.queueLength > 0 && (
        <span style={{
          marginLeft: 'auto',
          fontSize: '11px',
          background: 'var(--bg-hover)',
          padding: '1px 6px',
          borderRadius: '4px',
          color: 'var(--text-secondary)',
        }}>
          {bot.queueLength}
        </span>
      )}
    </button>
  )
}

function ProjectItem({ project }: { project: ProjectInfo }) {
  const setSelectedProjectPath = useDashboardStore((s) => s.setSelectedProjectPath)
  const selectedProjectPath = useDashboardStore((s) => s.selectedProjectPath)
  const selected = selectedProjectPath === project.path

  return (
    <button
      onClick={() => setSelectedProjectPath(selected ? null : project.path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '6px 16px',
        border: 'none',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: '13px',
        textAlign: 'left',
      }}
    >
      <span>{project.name}</span>
      {project.lockHolder && (
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--accent-yellow)' }}>
          {'\u{1F512}'}
        </span>
      )}
    </button>
  )
}
