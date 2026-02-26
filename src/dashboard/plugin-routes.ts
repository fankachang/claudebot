import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, PluginHttpRoute, PluginHttpRequest, PluginHttpResponse } from '../types/plugin.js'

const PLUGIN_API_PREFIX = '/api/plugins/'

interface CompiledRoute {
  readonly method: string
  readonly pattern: RegExp
  readonly paramNames: readonly string[]
  readonly handler: PluginHttpRoute['handler']
}

let compiledRoutes: readonly CompiledRoute[] = []

function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  const regexStr = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^${regexStr}$`), paramNames }
}

export function registerPluginRoutes(plugins: readonly Plugin[]): void {
  const routes: CompiledRoute[] = []

  for (const plugin of plugins) {
    if (!plugin.http) continue
    for (const route of plugin.http) {
      if (!route.path.startsWith(PLUGIN_API_PREFIX)) {
        console.warn(`[plugin-routes] Route "${route.path}" from "${plugin.name}" must start with ${PLUGIN_API_PREFIX}, skipping`)
        continue
      }
      const { pattern, paramNames } = compilePath(route.path)
      routes.push({
        method: route.method,
        pattern,
        paramNames,
        handler: route.handler,
      })
    }
  }

  compiledRoutes = routes
  if (routes.length > 0) {
    console.log(`[plugin-routes] Registered ${routes.length} plugin HTTP route(s)`)
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const MAX_BODY = 64 * 1024
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        req.destroy()
        reject(new Error('Body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

export async function handlePluginRoute(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = (req.method ?? 'GET').toUpperCase()

  for (const route of compiledRoutes) {
    if (route.method !== method) continue
    const match = path.match(route.pattern)
    if (!match) continue

    const params: Record<string, string> = {}
    for (let i = 0; i < route.paramNames.length; i++) {
      params[route.paramNames[i]] = decodeURIComponent(match[i + 1])
    }

    const query: Record<string, string> = {}
    for (const [k, v] of url.searchParams) {
      query[k] = v
    }

    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k] = v
    }

    let body: unknown = null
    let rawBody = ''
    if (method === 'POST' || method === 'PUT') {
      try {
        rawBody = await readBody(req)
        body = rawBody ? JSON.parse(rawBody) : null
      } catch {
        body = null
      }
    }

    const pluginReq: PluginHttpRequest = { method, path, params, query, body, rawBody, headers }

    let pluginRes: PluginHttpResponse
    try {
      pluginRes = await route.handler(pluginReq)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[plugin-routes] Handler error for ${method} ${path}:`, msg)
      pluginRes = { status: 500, body: { error: 'Internal plugin error' } }
    }

    const resHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...pluginRes.headers,
    }
    res.writeHead(pluginRes.status, resHeaders)
    res.end(JSON.stringify(pluginRes.body))
    return true
  }

  return false
}
