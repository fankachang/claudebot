import { useEffect, useRef } from 'react'
import { useDashboardStore } from '../stores/dashboard-store'
import type { HeartbeatMessage } from '../types'

const RECONNECT_DELAY_MS = 3_000

export function useWebSocket(): void {
  const setBots = useDashboardStore((s) => s.setBots)
  const setWsConnected = useDashboardStore((s) => s.setWsConnected)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function connect(): void {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as HeartbeatMessage
          if (data.type === 'heartbeat') {
            setBots(data.bots)
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        wsRef.current = null
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [setBots, setWsConnected])
}
