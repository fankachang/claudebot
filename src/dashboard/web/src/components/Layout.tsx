import { useDashboardStore } from '../stores/dashboard-store'
import { useSettingsStore } from '../stores/settings-store'
import { useTranslation } from '../hooks/useTranslation'
import { Sidebar } from './Sidebar'

interface LayoutProps {
  readonly children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation()
  const wsConnected = useDashboardStore((s) => s.wsConnected)
  const bots = useDashboardStore((s) => s.bots)
  const onlineCount = bots.filter((b) => b.online).length
  const theme = useSettingsStore((s) => s.theme)
  const locale = useSettingsStore((s) => s.locale)
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const toggleLocale = useSettingsStore((s) => s.toggleLocale)

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{t('header.title')}</h1>
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: wsConnected ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: wsConnected ? 'var(--accent-green)' : 'var(--accent-red)',
              }} />
              {wsConnected ? t('header.ws.connected') : t('header.ws.disconnected')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {t('header.botsOnline', { n: onlineCount, s: onlineCount !== 1 ? 's' : '' })}
            </span>
            <button className="toggle-btn" onClick={toggleLocale}>
              {locale === 'zh' ? 'EN' : '中'}
            </button>
            <button className="toggle-btn" onClick={toggleTheme}>
              {theme === 'dark' ? '\u2600' : '\u263D'}
            </button>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
