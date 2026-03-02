# ClaudeBot

Telegram bot that wraps Claude Code CLI into a mobile command center.
Not a pipe to Claude — a platform with plugins, queue, multi-project, and interactive UI.

## Stack
- **Runtime**: Node.js + TypeScript (strict)
- **Bot framework**: Telegraf v4
- **Validation**: zod
- **Auth**: bcrypt (dual: plain password or hash)
- **Entry**: `src/launcher.ts` → spawns 1–N bot instances from `.env`, `.env.bot2`, etc.

## Architecture at a glance

```
src/
  launcher.ts          ← Multi-bot launcher
  bot/                 ← Core: commands, handlers, middleware, queue
  claude/              ← Claude CLI runner + session store
  ai/                  ← Multi-backend AI (Claude, Gemini) + session store
  plugins/             ← Plugin system (hot-reloadable)
  remote/              ← Remote pairing: relay server, agent, protocol, tools
  asr/                 ← Sherpa-ONNX voice recognition
  config/              ← env, projects scanner
  telegram/            ← Telegram helpers (message splitting, etc.)
  utils/               ← System prompt, choice detector, path validator
  dashboard/           ← Web dashboard (heartbeat, command reader)
  mcp/                 ← MCP server integration
  types/               ← Shared TypeScript types
```

## Key patterns

### One process at a time
Queue system (`src/claude/queue.ts`) ensures only one Claude CLI process runs per bot.
Messages are queued and processed sequentially.

### Session continuity
Claude CLI `--resume <session_id>` keeps conversation context.
Session IDs stored in `.sessions.json`, keyed by `${BOT_ID}:${projectPath}`.
BOT_ID = last 6 chars of bot token → each bot instance has isolated sessions.

### Voice pipeline
ASR flow: OGG → ffmpeg 16kHz WAV → Sherpa ASR → biaodian punctuation.
- **Normal mode** (有選專案): show `🗣⚡` immediately → resolve buffer → background Gemini refinement (semaphore=1, non-blocking). If Gemini succeeds, edit message to remove ⚡.
- **ASR mode** (`/asr`): show code block for copy, no Gemini.
- Gemini CLI runs via `node @google/gemini-cli/dist/index.js` (bypasses cmd.exe on Windows).

### Stream output
Claude CLI `--output-format stream-json` parsed line-by-line from stdout.
Telegram message edited with 1s debounce, truncated at 4096 chars.

### Plugin system
Plugins live in `src/plugins/<name>/index.ts`, export `Plugin` interface.
Enabled via `PLUGINS=` env var (comma-separated).
Hot-reloadable via `/reload` command.
Plugin Store for install/uninstall (`/store`, `/install`, `/uninstall`).

### Multi-bot instances
`src/launcher.ts` spawns separate processes for each `.env.botN` file.
Each bot has its own token, plugins, and isolated sessions.

### Remote pairing (zero-cost remote control)

Operate a remote computer (N-side) from Telegram via bot on A-side. Zero AI cost — WebSocket relay.

```
Telegram → Bot (A-side) → relay-server.ts → WS → agent.ts (N-side)
                                                     ↓
                                              tool-handlers.ts (10 tools)
```

**`src/remote/`**: `protocol.ts` (wire types), `relay-server.ts` (WS relay), `relay-client.ts` (bot→relay for `/grab` & doc push), `agent.ts` (N-side CLI), `pairing-store.ts` (state in `.pairings.json`), `tool-handlers.ts` (10 tools), `mcp-config-generator.ts`.

**Tools**: `remote_read_file`, `remote_write_file`, `remote_list_directory`, `remote_search_files`, `remote_execute_command`, `remote_grep`, `remote_system_info`, `remote_project_overview`, `remote_fetch_file` (for `/grab`, 20MB), `remote_push_file` (for doc push, 20MB).

**Commands**: `/pair <code@ip:port>`, `/unpair`, `/rpair` (restart agent), `/grab <path>` (download as Telegram doc).
**Doc push**: send non-image file to bot while paired → caption = remote path (default `~/Downloads/<name>`).

**Remote mode pattern** — when paired without local project, handlers use:
```typescript
const project = state.selectedProject
  ?? (getPairing(chatId, threadId)?.connected ? { name: 'remote', path: process.cwd() } : null)
```
Used in: `callback-handler.ts`, `voice-handler.ts`, `new-session.ts`, `context.ts`.

**Env**: `REMOTE_ENABLED=true` per bot instance, `RELAY_PORT` (optional).

## Coding rules

- **Immutability**: Always create new objects, never mutate
- **Files**: Small and focused (<800 lines), organized by feature
- **Functions**: <50 lines, clear names
- **Errors**: Always handle with try/catch, user-friendly messages
- **Security**: `shell: false` on spawn, validate all user input with zod
- **No console.log in production** (use console.error for actual errors only)

## Commands overview

### Core (registered in bot.ts)
/projects, /select, /model, /status, /cancel, /new, /fav,
/todo, /todos, /idea, /ideas, /run, /chat, /newbot,
/store, /install, /uninstall, /reload, /asr, /context,
/restart, /deploy, /pair, /unpair, /rpair, /grab,
/claudemd, /rstatus, /rlog, /help

### Plugins (enabled per-bot via PLUGINS env)
dice, coin, reminder, screenshot, search, browse, cost,
github (star), mcp, scheduler, sysinfo, stats, calc,
map, mdfix, remote, task, write

## Adding a new plugin

### Step 1: Write the plugin

Create `src/plugins/<name>/index.ts`, export default `Plugin` object:

```typescript
import type { Plugin } from '../../types/plugin.js'
import type { BotContext } from '../../types/context.js'

async function myCommand(ctx: BotContext): Promise<void> {
  // ...
}

const plugin: Plugin = {
  name: '<name>',
  description: '簡短描述',
  commands: [
    { name: '<cmd>', description: '指令說明', handler: myCommand },
  ],
}

export default plugin
```

### Step 2: Local test

1. Add to `PLUGINS=` in `.env`
2. `/reload` to hot-load (or restart)
3. Test all commands in Telegram

### Step 3: Publish to Plugin Store (REQUIRED)

Plugin Store repo: `Jeffrey0117/claudebot-plugins`

**A. Upload source** — push `index.ts` to `plugins/<name>/` in the store repo:
```bash
gh api repos/Jeffrey0117/claudebot-plugins/contents/plugins/<name>/index.ts \
  -X PUT --input <(python -c "
import base64, json
with open('src/plugins/<name>/index.ts','rb') as f:
    print(json.dumps({'message':'feat: add <name> plugin','content':base64.b64encode(f.read()).decode()}))
")
```

**B. Update registry** — add entry to `registry.json`:
```bash
# 1. Get current SHA
gh api repos/Jeffrey0117/claudebot-plugins/contents/registry.json --jq '.sha'
# 2. Download, add new entry, re-upload with SHA
```

Registry entry format:
```json
{
  "name": "<name>",
  "description": "中文描述",
  "commands": [{ "name": "<cmd>", "description": "指令說明" }],
  "author": "Jeffrey"
}
```

**C. Verify** — `/store` should show the new plugin, `/install <name>` should work

## When reading memory files

Detailed notes are in `~/.claude/projects/.../memory/`:
- `MEMORY.md` — Quick index (auto-loaded)
- `architecture.md` — Data flow, module details
- `gotchas.md` — Bugs encountered, lessons learned
- `roadmap.md` — Feature ideas, user requests
