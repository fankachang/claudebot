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
  bot/                 ← Core: commands, handlers, middleware, queue, data stores
  claude/              ← Claude CLI runner + session store + file lock
  ai/                  ← Multi-backend AI (Claude, Gemini) + session store
  auth/                ← Authentication (bcrypt password verification)
  plugins/             ← Plugin system (hot-reloadable)
  remote/              ← Remote pairing: relay server, agent, protocol, tools
  git/                 ← Git worktree management (multi-bot parallel dev)
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

### Multi-backend AI (`src/ai/`)
Supports Claude and Gemini backends. `src/ai/registry.ts` routes to the right runner.
User selects via `/model` (auto/claude:sonnet/claude:opus/gemini:flash).
Session IDs stored per-backend: `${BOT_ID}:${backend}:${projectPath}`.

### Context preservation
- Short replies (≤15 chars) auto-inject `[前次回覆參考]` with last Claude response
- Affirmative replies (≤80 chars starting with 好/可以/OK/嗯...) also inject context
- Prevents "amnesia" when context compresses

### Ordered message buffer (`src/bot/ordered-message-buffer.ts`)
Buffers text + voice per chat/thread, keyed by Telegram message_id (ascending).
Voice entries start 'pending' → block flush; `resolveVoice` triggers `tryFlush`.
1s text timer, 30s staleness sweep, `forceFlush` on project switch.

### Choice detector (`src/utils/choice-detector.ts`)
Detects numbered lists in Claude responses → generates Telegram inline buttons.
Only triggers when accompanied by a selection prompt (哪/選/which/pick).

### Data stores (`src/bot/`)
- **bookmarks.ts** — `/fav` manages up to 9 project shortcuts (`/1`–`/9`)
- **context-pin-store.ts** — `/context pin` pins up to 10 snippets per project, auto-injected into prompts
- **todo-store.ts** — `/todo` per-project task tracking
- **idea-store.ts** — `/idea` stores dated, tagged ideas in `data/ideas.md`
- **last-response-store.ts** — Caches last Claude response for context injection
- **suggestion-store.ts** — Stores follow-up suggestions from Claude
- **choice-store.ts** — Stores active choice buttons
- **asr-store.ts** — Per-user voice recognition mode (on/off)

### Bio updater (`src/bot/bio-updater.ts`)
Updates bot's Telegram bio with current project name. Pins project status message in chat.

### Auto-commit
`AUTO_COMMIT=true` in `.env` → automatically `git add -A && git commit` after each Claude interaction.

### Plugin system
Plugins live in `src/plugins/<name>/index.ts`, export `Plugin` interface.
Enabled via `PLUGINS=` env var (comma-separated).
Hot-reloadable via `/reload` command.
Plugin Store for install/uninstall (`/store`, `/install`, `/uninstall`).

### Multi-bot instances
`src/launcher.ts` spawns separate processes for each `.env.botN` file.
Each bot has its own token, plugins, and isolated sessions.

### Git worktree isolation (multi-bot parallel dev)

Multiple bot instances can work on the same project simultaneously using git worktrees.
Each bot gets its own branch + working directory, merges back to master on `/deploy`.

```
C:\...\ClaudeBot\          ← master (main worktree)
C:\...\ClaudeBot--bot1\    ← worktree: bot1 branch
C:\...\ClaudeBot--bot5\    ← worktree: bot5 branch
```

**Config**: Set `WORKTREE_BRANCH=bot1` in `.env` (per bot instance). No value = no worktree (default).

**`src/git/worktree.ts`**: `ensureWorktree()` (auto-create), `mergeToMain()`, `syncFromMain()`, `isWorktree()`, `mainRepoPath()`.

**How it works**: When a bot selects a project via `findProject()`, `resolveWorktreePath()` checks `WORKTREE_BRANCH` and auto-creates/reuses a worktree. Queue, lock, and session systems isolate automatically because they key on `projectPath`.

**Deploy flow**: `/deploy` on a worktree → commit on branch → merge to master → push master → sync remote.

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
/claudemd, /rstatus, /rlog, /help,
/login, /logout, /prompt, /cd, /mkdir, /1–/9 (bookmark shortcuts)

### Plugins (enabled per-bot via PLUGINS env)
browse, calc, cost, dice, github (star), map, mcp, mdfix,
reminder, remote, scheduler, screenshot, search, stats,
sysinfo, task, write

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

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | yes | Telegram bot token |
| `ALLOWED_CHAT_IDS` | yes | Comma-separated allowed Telegram chat IDs |
| `PROJECTS_BASE_DIR` | yes | Comma-separated project scan directories |
| `LOGIN_PASSWORD` | * | Plain-text login password |
| `LOGIN_PASSWORD_HASH` | * | bcrypt hash (alternative to plain) |
| `AUTO_AUTH` | no | Skip login (`true`/`false`, default `true`) |
| `DEFAULT_MODEL` | no | `haiku`/`sonnet`/`opus` (default `sonnet`) |
| `PLUGINS` | no | Comma-separated plugin names to enable |
| `WORKTREE_BRANCH` | no | Git worktree branch name (e.g. `bot1`) |
| `AUTO_COMMIT` | no | Auto git commit after Claude responses |
| `REMOTE_ENABLED` | no | Enable remote pairing relay server |
| `RELAY_PORT` | no | WebSocket relay port (default `9877`) |
| `GEMINI_API_KEY` | no | Gemini API key for voice refinement |
| `GITHUB_TOKEN` | no | GitHub API token for `/star`, `/follow` |
| `ANTHROPIC_ADMIN_KEY` | no | Anthropic admin key for `/usage` |
| `DASHBOARD` | no | Enable web dashboard |
| `DASHBOARD_PORT` | no | Dashboard port (default `3100`) |
| `PREVENT_SLEEP` | no | Prevent OS sleep |
| `MCP_BROWSER` | no | Enable Playwright MCP server |
| `MCP_AGENT_BROWSER` | no | Enable agent-browser MCP server |
| `SHERPA_SERVER_PATH` | no | Path to Sherpa ASR server |
| `BIAODIAN_PATH` | no | Path to punctuation model |
| `TELEGRAM_API_BASE` | no | Custom Telegram API base URL (proxy) |
| `TELEGRAM_PROXY` | no | HTTPS proxy for Telegram |
| `SKIP_PERMISSIONS` | no | Skip Claude CLI permission checks |
| `MAX_TURNS` | no | Max turns per Claude session |
| `RATE_LIMIT_MAX` | no | Max requests per window (default `10`) |
| `RATE_LIMIT_WINDOW_MS` | no | Rate limit window ms (default `60000`) |
| `ADMIN_CHAT_ID` | no | Admin chat ID for system notifications |
| `PLUGIN_REGISTRY_URL` | no | Plugin store registry JSON URL |

\* Either `LOGIN_PASSWORD`, `LOGIN_PASSWORD_HASH`, or `AUTO_AUTH=true` is required.

## When reading memory files

Detailed notes are in `~/.claude/projects/.../memory/`:
- `MEMORY.md` — Quick index (auto-loaded)
- `architecture.md` — Data flow, module details
- `gotchas.md` — Bugs encountered, lessons learned
- `roadmap.md` — Feature ideas, user requests
