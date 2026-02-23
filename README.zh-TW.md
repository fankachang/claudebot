<p align="center">
  <img src="claudebot-logo.png" alt="ClaudeBot" width="160" />
</p>

<h1 align="center">ClaudeBot</h1>

<p align="center">
  <strong>不是接 Claude 的管子，是你手機上的指揮中心。</strong>
</p>

<p align="center">
  繁體中文 | <a href="README.md">English</a>
</p>

---

透過 Telegram 遠端操控 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)。管理專案、即時串流回應、執行插件 — 全在你的口袋裡。

Claude 是引擎。儀表板、佇列、插件、互動介面是我們的。

## 功能特色

| 功能 | 說明 |
|------|------|
| **即時串流** | 每秒更新狀態 — 執行時間、工具數量、工具名稱 |
| **多專案工作區** | 每個專案獨立 session，自動 `--resume`，瞬間切換 |
| **佇列系統** | 連續送出多個請求，依序執行，跨 bot 檔案鎖定互斥 |
| **互動式回應** | 問題自動出現確認按鈕，回答自動生成智慧後續建議 |
| **跨專案委派** | `@run(project) prompt` 讓 Claude 自主跨 repo 串聯任務 |
| **多 Bot 支援** | 同一份程式碼跑 4+ 個 bot，一鍵啟動，群組 @mention 路由 |
| **插件系統** | 截圖、骰子、提醒、系統資訊 — 即時執行，零 AI 成本，可自行擴充 |
| **安全性** | Chat ID 白名單、bcrypt 密碼驗證、速率限制、`shell: false` 防注入 |

## 與其他方案的比較

| | ClaudeBot | tmux bridge | API proxy |
|---|---|---|---|
| 即時輸出 | 串流 + 工具進度 | 完成後才回傳 | 不適用 |
| 佇列與併發 | 完整佇列 + 跨 bot 互斥 | 單一請求 | 不適用 |
| 認證機制 | Chat ID + bcrypt + 速率限制 | 無 | API key |
| 多專案 | 每專案獨立 session，自動恢復 | 單一 session | 不適用 |
| 互動介面 | 按鈕 + 建議 | 純文字 | Web 面板 |
| 擴充性 | 插件系統 | Shell 腳本 | YAML 設定 |

## 架構

```
Telegram ──> ClaudeBot ──> Claude CLI
  (你)          │              │
              插件           專案
          (零成本)       (via @run)
```

- **插件**擴充 bot — 不經過 Claude 的即時指令（`/screenshot`、`/sysinfo`、`/dice`、`/remind`）
- **專案**擴充 Claude — 每個 repo 是一個完整的工作空間，帶有上下文和 session 記錄

## 快速開始

### 前置條件

- **Node.js** >= 18（[下載](https://nodejs.org/)）
- **Claude CLI** 已安裝並登入：
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude
  ```

### 安裝

```bash
git clone https://github.com/Jeffrey0117/ClaudeBot.git
cd ClaudeBot
npm install
cp .env.example .env    # 填入你的設定值
npm run dev
```

### 設定項目

| 變數 | 必填 | 預設值 | 說明 |
|------|------|--------|------|
| `BOT_TOKEN` | 是 | — | 從 [@BotFather](https://t.me/BotFather) 取得的 Telegram bot token |
| `ALLOWED_CHAT_IDS` | 是 | — | 允許的 Telegram chat ID（逗號分隔） |
| `PROJECTS_BASE_DIR` | 是 | — | 專案目錄路徑（逗號分隔） |
| `PLUGINS` | 否 | — | 啟用的插件名稱（逗號分隔） |
| `LOGIN_PASSWORD` | 否\* | — | 純文字登入密碼 |
| `LOGIN_PASSWORD_HASH` | 否\* | — | Bcrypt 雜湊（建議用於正式環境） |
| `AUTO_AUTH` | 否 | `true` | 自動驗證白名單聊天室 |
| `DEFAULT_MODEL` | 否 | `sonnet` | 預設模型（`haiku` / `sonnet` / `opus`） |
| `RATE_LIMIT_MAX` | 否 | `10` | 每個時間窗口的最大訊息數 |
| `RATE_LIMIT_WINDOW_MS` | 否 | `60000` | 速率限制時間窗口（毫秒） |
| `MAX_TURNS` | 否 | — | Claude 最大對話輪數 |

\* 當 `AUTO_AUTH=true` 時密碼為選填。當 `AUTO_AUTH=false` 時，需設定 `LOGIN_PASSWORD` 或 `LOGIN_PASSWORD_HASH` 其中之一。

<details>
<summary><strong>如何取得設定值</strong></summary>

**BOT_TOKEN** — 在 Telegram 搜尋 [@BotFather](https://t.me/BotFather)，傳送 `/newbot`，複製 token。

**ALLOWED_CHAT_IDS** — 搜尋 [@userinfobot](https://t.me/userinfobot)，傳送任何訊息即可取得你的 ID。

**PROJECTS_BASE_DIR** — 你的程式碼資料夾路徑：
```
PROJECTS_BASE_DIR=C:\Users\you\code
PROJECTS_BASE_DIR=C:\Users\you\code,D:\projects
```

</details>

## 指令

### 核心

| 指令 | 說明 |
|------|------|
| `/projects` | 瀏覽並選擇專案 |
| `/select <名稱>` | 快速切換專案 |
| `/model` | 切換模型（haiku/sonnet/opus） |
| `/status` | 顯示佇列與活動專案 |
| `/cancel` | 停止當前處理程序 |
| `/new` | 新對話（清除歷史） |
| `/chat` | 一般對話（不需選專案） |
| `/restart` | 遠端重啟 bot |

### 書籤

| 指令 | 說明 |
|------|------|
| `/fav` | 管理書籤 |
| `/fav add` | 將當前專案加入書籤 |
| `/1` ~ `/9` | 切換到書籤專案 |

### 待辦事項

| 指令 | 說明 |
|------|------|
| `/todo <文字>` | 新增待辦到當前專案 |
| `/todo @專案 <文字>` | 新增待辦到指定專案 |
| `/todos` | 列出待辦事項 |
| `/todos <編號>` | 切換完成狀態 |
| `/todos done` | 清除已完成項目 |

### 跨專案

| 指令 | 說明 |
|------|------|
| `/run <專案> <提示>` | 在另一個專案上執行任務 |
| `/mkdir <名稱>` | 建立新專案資料夾 |

Claude 也能自主委派 — 當回應中包含 `@run(projectName) description` 時，bot 會自動將任務排入目標專案的佇列。

### 使用技巧

- 直接傳送文字即可在選定專案中與 Claude 對話
- 開頭加 `!` 可中斷當前處理並重新導向
- 2 秒內的連續訊息會自動合併
- 支援傳送照片/文件 — Claude 看得到
- 用 `@chat <訊息>` 進行一次性的一般對話

## 插件系統

插件不經過 Claude — 即時執行，零成本。

```env
PLUGINS=screenshot,sysinfo,dice,reminder
```

| 插件 | 指令 | 說明 |
|------|------|------|
| `screenshot` | `/screenshot` | 桌面截圖與網頁截圖 |
| `sysinfo` | `/sysinfo` | CPU、GPU、記憶體、磁碟資訊 |
| `dice` | `/dice`、`/coin` | 擲骰子、拋硬幣 |
| `reminder` | `/remind` | 設定計時提醒 |

<details>
<summary><strong>建立自己的插件</strong></summary>

在 `src/plugins/` 新增資料夾，包含 `index.ts`：

```typescript
import type { Plugin } from '../../types/plugin.js'

const myPlugin: Plugin = {
  name: 'my-plugin',
  description: '插件說明',
  commands: [
    {
      name: 'mycommand',
      description: '指令說明',
      handler: async (ctx) => {
        await ctx.reply('Hello from plugin!')
      },
    },
  ],
}

export default myPlugin
```

將資料夾名稱加入 `.env` 的 `PLUGINS` 即可啟用。Bot 會自動註冊指令並更新 `/help`。

</details>

## 多 Bot 與群組

同一份程式碼跑多個 bot 實例：

1. 透過 [@BotFather](https://t.me/BotFather) 建立新 bot
2. 建立 `.env.bot2`、`.env.bot3` 等設定檔
3. `npm run dev` 一次啟動所有 bot

將 bot 加入 Telegram 群組即可團隊協作 — **@mention 路由**將任務分配到指定 bot，每個 bot 的簡介會顯示當前操作的專案。

## 正式部署

```bash
npm install -g pm2
pm2 start npm --name claudebot -- run dev
pm2 save && pm2 startup
```

## 技術棧

Telegraf v4 · TypeScript · Playwright · bcrypt · zod

## 授權

MIT
