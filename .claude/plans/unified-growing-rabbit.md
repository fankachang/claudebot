# Plan: Remote MCP Proxy — "Bring Your Own Brain"

## Context

讓 Claude CLI（在 A 電腦）透過 WebSocket 操作遠端 N 電腦的檔案系統。N 電腦只需開一個 Node.js agent（未來包成 Electron），零登入、零設定、零 API key。

用例：Demo vibe coding、臨時幫人寫 code，用完關掉零痕跡。

## Architecture

```
Claude CLI ←stdio→ remote-proxy-server.ts (A 本機) ←WebSocket→ remote-agent.ts (N 電腦)
                                                                    ↓
                                                              本地 Read/Write/Bash
```

Claude CLI 只支援 local stdio MCP server，所以需要一個本機 proxy 轉發到 WebSocket。

## Pairing Flow

1. N 電腦執行 `npx tsx src/mcp/remote-agent.ts --port 9500 --root C:\project`
2. 螢幕顯示 `IP: 192.168.1.5:9500 | Code: 482617`
3. 用戶在 Telegram 輸入 `/pair 192.168.1.5:9500 482617`
4. ClaudeBot 連線驗證 → 取得 session token → 寫入動態 MCP config
5. 之後 Claude CLI 啟動時自動載入 remote MCP proxy
6. `/unpair` 斷開連線、刪除 config

## New Files (7 files, ~700 lines)

### 1. `src/mcp/remote-types.ts` (~50 lines)

共用 wire protocol types + zod schemas。

```typescript
// Wire protocol
interface RemoteRequest {
  readonly id: string
  readonly type: 'tool_call'
  readonly tool: string
  readonly args: Record<string, unknown>
}

interface RemoteResponse {
  readonly id: string
  readonly type: 'tool_result'
  readonly success: boolean
  readonly content: string
}

interface PairRequest {
  readonly type: 'pair'
  readonly code: string
}

interface PairResponse {
  readonly type: 'pair_result'
  readonly success: boolean
  readonly token?: string        // session token for subsequent proxy connections
  readonly projectRoot?: string
}

// Zod schemas for tool args
ReadArgsSchema, WriteArgsSchema, EditArgsSchema, BashArgsSchema, LsArgsSchema, GlobArgsSchema, GrepArgsSchema
```

### 2. `src/mcp/remote-agent.ts` (~300 lines)

在 N 電腦執行的 WebSocket server。

**啟動方式**: `npx tsx src/mcp/remote-agent.ts --port 9500 --root C:\Users\someone\project`

**功能**:
- 啟動時生成 6 位配對碼（一次性、5 分鐘過期）
- 顯示本機 IP:port + 配對碼
- 接受 WebSocket 連線，驗證配對碼後發 session token
- 後續 proxy 連線用 token 認證（`ws://host:port?token=xyz`）
- 單一 client 限制（已配對時拒絕新連線）
- Heartbeat: 每 15 秒 ping，30 秒無 pong 斷線

**Tool implementations** (全部在 N 電腦本地執行):
- `remote_read(path)` — `fs.readFile`，限 1MB
- `remote_write(path, content)` — `fs.writeFile`，限 512KB
- `remote_edit(path, old_string, new_string)` — 讀取 → 替換 → 寫入
- `remote_bash(command, cwd?)` — `execFile` with `shell: false`，30 秒逾時
- `remote_ls(path)` — `fs.readdir` with 類型標記
- `remote_glob(pattern, path?)` — `fast-glob` or `fs.readdir` recursive
- `remote_grep(pattern, path?)` — `execFile('grep')`/`execFile('findstr')` 跨平台

**安全**:
- 所有路徑強制 `path.resolve(root, ...)` 並驗證不超出 root
- Bash 的 cwd 也限制在 root 內
- `shell: false` 防止 command injection

### 3. `src/mcp/remote-proxy-server.ts` (~200 lines)

在 A 電腦執行的 local stdio MCP server（Claude CLI spawn 的 child process）。

**MCP server pattern** (與 `browser-server.ts` 相同):
- `Server` + `StdioServerTransport` from `@modelcontextprotocol/sdk`
- `ListToolsRequestSchema` → 列出 7 個 remote_* 工具
- `CallToolRequestSchema` → 轉發到 WebSocket

**WebSocket 連線**:
- 讀取 `--ws-url` 命令列參數（含 token query string）
- 連線到 N 電腦的 remote-agent
- 每個 tool call 生成 UUID，send 到 WebSocket，等 response（60 秒逾時）
- 用 `pendingRequests` Map 管理 request-response 配對

**工具定義**:
| Tool | Description |
|------|-------------|
| `remote_read` | Read a file on the remote computer |
| `remote_write` | Write a file on the remote computer |
| `remote_edit` | Edit a file (find and replace) on the remote computer |
| `remote_bash` | Execute a command on the remote computer |
| `remote_ls` | List directory contents on the remote computer |
| `remote_glob` | Find files by pattern on the remote computer |
| `remote_grep` | Search file contents on the remote computer |

### 4. `src/mcp/remote-config.ts` (~25 lines)

動態 MCP config 管理：
- `writeRemoteMcpConfig(wsUrl)` — 寫入 `data/mcp-remote-active.json`
- `deleteRemoteMcpConfig()` — 刪除
- `hasRemoteMcpConfig()` — 檢查是否存在

Config 內容:
```json
{
  "mcpServers": {
    "remote": {
      "command": "npx",
      "args": ["tsx", "src/mcp/remote-proxy-server.ts", "--ws-url", "ws://192.168.1.5:9500?token=xyz"]
    }
  }
}
```

### 5. `src/mcp/remote-session.ts` (~30 lines)

記憶目前的 remote session 狀態：
- `setRemoteSession({ wsUrl, projectRoot, chatId })`
- `getRemoteSession()`
- `clearRemoteSession()`
- `isRemoteActive()`

### 6. `src/bot/commands/pair.ts` (~80 lines)

`/pair <host:port> <code>` 指令：
1. 解析參數（zod 驗證 host:port 格式 + 6 位數字）
2. WebSocket 連線到 N 電腦
3. 發送 `{ type: 'pair', code }` 驗證配對碼
4. 收到 `pair_result` → 取得 token + projectRoot
5. 呼叫 `writeRemoteMcpConfig(wsUrl + token)` 寫入動態 config
6. 呼叫 `setRemoteSession()` 記錄狀態
7. 回覆用戶連線成功訊息
8. 關閉臨時 WebSocket（proxy server 會自己建連線）

### 7. `src/bot/commands/unpair.ts` (~20 lines)

`/unpair` 指令：
1. 檢查是否有 active session
2. `clearRemoteSession()` + `deleteRemoteMcpConfig()`
3. 回覆用戶已斷開

## Files to Modify (3 files, ~30 lines)

### 8. `src/claude/claude-runner.ts` (+5 lines, around line 178)

在現有 mcpConfigs 組裝邏輯後加入：

```typescript
import { hasRemoteMcpConfig } from '../mcp/remote-config.js'

// ... 在 mcpConfigs 組裝區段末尾:
if (hasRemoteMcpConfig()) {
  mcpConfigs.push(path.resolve('data', 'mcp-remote-active.json'))
}
```

### 9. `src/utils/system-prompt.ts` (+20 lines)

在 `getSystemPrompt()` 末尾加入 remote mode 提示：

```typescript
import { isRemoteActive, getRemoteSession } from '../mcp/remote-session.js'

// 在 return 之前:
if (isRemoteActive()) {
  const session = getRemoteSession()
  result += `\n\n## REMOTE MODE\nUse remote_* MCP tools for all file operations on remote computer.\nRemote root: ${session?.projectRoot}\nAvailable: remote_read, remote_write, remote_edit, remote_bash, remote_ls, remote_glob, remote_grep`
}
```

### 10. `src/bot/bot.ts` (+6 lines)

```typescript
// Import (top section):
import { pairCommand } from './commands/pair.js'
import { unpairCommand } from './commands/unpair.js'

// coreEntries array (line ~170):
['pair', pairCommand],
['unpair', unpairCommand],

// CORE_COMMANDS array (line ~95):
{ command: 'pair', description: '連線遠端電腦 (IP:port code)' },
{ command: 'unpair', description: '斷開遠端連線' },
```

## Implementation Order

| Step | Files | 可獨立測試 |
|------|-------|-----------|
| 1 | `remote-types.ts` | 純型別，無依賴 |
| 2 | `remote-agent.ts` | `npx tsx` 單獨跑，用 wscat 測試 |
| 3 | `remote-proxy-server.ts` | 搭配 step 2 測試 MCP tool call 轉發 |
| 4 | `remote-config.ts` + `remote-session.ts` | 單元級，無外部依賴 |
| 5 | `pair.ts` + `unpair.ts` + bot.ts 修改 | Telegram 端測試 |
| 6 | `claude-runner.ts` + `system-prompt.ts` 修改 | 完整 E2E 測試 |

## Verification

1. **Build**: `npm run build` — 確認 TypeScript 編譯通過
2. **Remote Agent 單獨測試**:
   ```bash
   npx tsx src/mcp/remote-agent.ts --port 9500 --root C:\Users\jeffb\Desktop\code\test-project
   # 確認顯示 IP:port + 配對碼
   ```
3. **Pairing 測試**: Telegram 送 `/pair localhost:9500 <code>` → 確認連線成功
4. **E2E 測試**: 送訊息請 Claude 讀取遠端檔案 → 確認 Claude 使用 `remote_read` 工具
5. **Unpair 測試**: `/unpair` → 確認 config 被刪除，下次 Claude 不載入 remote MCP

## Key Design Decisions

1. **Token-based auth** — 配對碼驗證後發 token，proxy server 用 token 連線，比 IP-based 更安全
2. **動態 config file** — `/pair` 寫、`/unpair` 刪，不需要 env var toggle
3. **單一 client** — remote-agent 一次只接一個連線，避免競態
4. **路徑限制** — 所有操作鎖定在 `--root` 內，防止目錄穿越
5. **Electron 後做** — MVP 先用 CLI (`npx tsx`)，Electron 包裝是 Phase 2
