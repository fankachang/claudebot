import { useState, useEffect, useRef } from 'react'
import { useDashboardStore } from '../stores/dashboard-store'
import { useTranslation } from '../hooks/useTranslation'
import { apiPost } from '../hooks/useApi'
import type { DashboardCommand } from '../types'

export function CommandPanel() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const commands = useDashboardStore((s) => s.commands)
  const addCommand = useDashboardStore((s) => s.addCommand)
  const draftPrompt = useDashboardStore((s) => s.draftPrompt)
  const setDraftPrompt = useDashboardStore((s) => s.setDraftPrompt)

  // Pick up draft from templates
  useEffect(() => {
    if (draftPrompt) {
      setInput(draftPrompt)
      setDraftPrompt('')
      inputRef.current?.focus()
    }
  }, [draftPrompt, setDraftPrompt])

  const handleSend = async () => {
    const prompt = input.trim()
    if (!prompt || sending) return

    setSending(true)
    try {
      const data = await apiPost<{ command: DashboardCommand }>('/api/commands', {
        type: 'prompt',
        payload: { prompt },
      })
      addCommand(data.command)
      setInput('')
    } catch {
      // silent for now
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const recentCommands = commands.slice(-20).reverse()

  return (
    <div style={{
      padding: '24px',
      borderTop: '1px solid var(--border)',
    }}>
      <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>{t('command.title')}</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('command.placeholder')}
          disabled={sending}
          style={{
            flex: 1,
            padding: '10px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          style={{
            padding: '10px 20px',
            background: sending ? 'var(--bg-hover)' : 'var(--accent-blue)',
            border: 'none',
            borderRadius: 'var(--radius)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: sending ? 'not-allowed' : 'pointer',
            opacity: !input.trim() ? 0.5 : 1,
          }}
        >
          {sending ? t('command.sending') : t('command.send')}
        </button>
      </div>

      {recentCommands.length > 0 && (
        <div style={{ fontSize: '13px' }}>
          {recentCommands.map((cmd) => (
            <CommandRow key={cmd.id} command={cmd} />
          ))}
        </div>
      )}
    </div>
  )
}

function CommandRow({ command }: { command: DashboardCommand }) {
  const time = new Date(command.createdAt).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })

  const statusIcon = {
    pending: '\u23F3',
    claimed: '\u{1F504}',
    completed: '\u2705',
    failed: '\u274C',
  }[command.status]

  const prompt = (command.payload.prompt as string) ?? command.type

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 0',
      borderBottom: '1px solid var(--border)',
      color: 'var(--text-secondary)',
    }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>{time}</span>
      <span style={{
        fontSize: '11px',
        padding: '1px 5px',
        borderRadius: '3px',
        background: 'var(--bg-hover)',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}>
        {command.type}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {prompt}
      </span>
      <span style={{ flexShrink: 0 }}>{statusIcon}</span>
      {command.claimedBy && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{command.claimedBy}</span>
      )}
    </div>
  )
}
