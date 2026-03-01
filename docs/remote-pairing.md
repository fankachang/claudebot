# Remote Pairing (遠端配對)

從手機 Telegram 操控另一台電腦上的檔案，AI 直接在遠端讀寫、搜尋、執行指令。

## 運作原理

```
手機 Telegram ──> ClaudeBot (本機)
                     │
                  WebSocket Relay
                     │
              Remote Agent (遠端電腦)
                     │
              MCP Tools (read/write/search/exec)
```

1. **本機** 跑 ClaudeBot launcher + relay server
2. **遠端電腦** 跑 `agent.ts`，透過 WebSocket 連回本機
3. Claude CLI 啟動時動態注入 remote MCP config
4. AI 收到 `[遠端配對模式]` prompt，自動使用 `remote_*` 工具操作遠端

## 快速開始

### 1. 本機設定

在你要啟用 remote 功能的 bot `.env` 檔加上：

```env
REMOTE_ENABLED=true
```

> 只有 `REMOTE_ENABLED=true` 的 bot 實例會注入 remote MCP。
> 其他 bot 完全不受影響（預設 `false`）。

### 2. 在 Telegram 輸入 `/pair`

Bot 會回覆配對碼和連線指令，例如：

```
🔑 配對碼: DO8-QJQ

👇 首次 — 複製貼到 terminal:
git clone https://github.com/Jeffrey0117/ClaudeBot.git && cd ClaudeBot && npm install && npx tsx src/remote/agent.ts ws://192.168.0.182:9877 DO8-QJQ

👇 已裝過 — 直接連:
git pull && npx tsx src/remote/agent.ts ws://192.168.0.182:9877 DO8-QJQ

💡 指定專案目錄加在最後面:
...DO8-QJQ C:\path\to\project
```

### 3. 在遠端電腦執行連線指令

配對碼 5 分鐘內有效。連上後 bot 會通知 `🔗 已配對`。

### 4. 開始使用

之後在 Telegram 發的訊息，AI 會透過 MCP 工具操作遠端電腦：

| MCP 工具 | 功能 |
|---------|------|
| `remote_read_file` | 讀取遠端檔案 |
| `remote_write_file` | 寫入遠端檔案 |
| `remote_list_directory` | 列出目錄 |
| `remote_search_files` | 搜尋檔案內容 |
| `remote_execute_command` | 執行 shell 指令 |

### 5. 斷開配對

```
/unpair
```

## 多 Bot 實例隔離

| 設定 | 行為 |
|------|------|
| `REMOTE_ENABLED=true` | 注入 remote prompt + MCP config |
| `REMOTE_ENABLED=false`（預設） | 完全忽略 remote 功能 |

建議只在**一個** bot 實例開啟（例如 bot5），避免多個 bot 搶用同一個配對。

配對狀態存在 `data/pairings.json`，以 `chatId + threadId` 為 key，所以不同 chat 之間天然隔離。

## 注意事項

- Relay server 只在 main bot 啟動（`isMainBot` 檢查）
- 配對碼 5 分鐘過期（未連線時），連線後不過期
- 遠端 agent 的 cwd 就是你指定的專案目錄（或 clone 的 ClaudeBot 目錄）
- AI 收到 `[遠端配對模式]` 時會優先使用 `remote_*` 工具，不會用本地的 Read/Write/Bash

## 相關檔案

| 檔案 | 說明 |
|------|------|
| `src/remote/pairing-store.ts` | 配對狀態管理（file-backed） |
| `src/remote/relay-server.ts` | WebSocket relay server |
| `src/remote/agent.ts` | 遠端 agent（跑在遠端電腦） |
| `src/remote/mcp-config-generator.ts` | 動態生成 MCP config |
| `src/mcp/remote-proxy-server.ts` | MCP proxy（Claude CLI ↔ relay） |
| `src/bot/commands/pair.ts` | `/pair` 和 `/unpair` 指令 |
| `src/claude/claude-runner.ts` | prompt + MCP 注入邏輯 |
