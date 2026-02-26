import type { BotContext } from './context.js'

// --- Output Hook types ---

export interface OutputMetadata {
  readonly projectPath: string
  readonly projectName: string
  readonly model: string
  readonly backend: string
  readonly sessionId: string
}

export interface OutputHookResult {
  readonly text: string
  readonly modified: boolean
  readonly warnings?: readonly string[]
}

// --- HTTP Route types ---

export interface PluginHttpRequest {
  readonly method: string
  readonly path: string
  readonly params: Record<string, string>
  readonly query: Record<string, string>
  readonly body: unknown
  readonly rawBody: string
  readonly headers: Record<string, string>
}

export interface PluginHttpResponse {
  readonly status: number
  readonly body: unknown
  readonly headers?: Record<string, string>
}

export interface PluginHttpRoute {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  readonly path: string
  readonly handler: (req: PluginHttpRequest) => Promise<PluginHttpResponse>
}

// --- Plugin interface ---

export interface PluginCommand {
  readonly name: string
  readonly description: string
  readonly handler: (ctx: BotContext) => Promise<void>
}

export interface Plugin {
  readonly name: string
  readonly description: string
  readonly commands: readonly PluginCommand[]
  readonly onMessage?: (ctx: BotContext) => Promise<boolean>
  readonly onCallback?: (ctx: BotContext, data: string) => Promise<boolean>
  readonly onOutput?: (text: string, meta: OutputMetadata) => Promise<OutputHookResult>
  readonly http?: readonly PluginHttpRoute[]
  readonly service?: {
    readonly start: () => Promise<void>
    readonly stop: () => Promise<void>
  }
  readonly cleanup?: () => Promise<void>
}
