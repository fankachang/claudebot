/**
 * CLI entry point for standalone dashboard server.
 * Loads .env BEFORE importing server.ts (which depends on env-dependent modules).
 */
import dotenv from 'dotenv'

dotenv.config()

const port = parseInt(process.env.DASHBOARD_PORT ?? '3100', 10)

const { startDashboardServer } = await import('./server.js')
startDashboardServer(port)
