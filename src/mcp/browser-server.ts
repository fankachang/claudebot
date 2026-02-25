#!/usr/bin/env tsx
/**
 * MCP Browser Server — exposes Playwright-based browsing as MCP tools.
 *
 * Tools provided:
 *   - browse(url)           → Navigate to URL, return text + links + inputs
 *   - search(query)         → Google search, return results
 *   - screenshot(url?)      → Take screenshot of current or given page
 *   - click(ref)            → Click a link by index
 *   - type(ref, text)       → Type into an input field
 *   - submit(ref?)          → Press Enter on a form field
 *   - back()                → Go back in history
 *
 * Usage:
 *   npx tsx src/mcp/browser-server.ts          (standalone)
 *   Claude CLI --mcp-config mcp-browser.json   (integrated)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { chromium, type Browser, type Page } from 'playwright'

// --- Browser state ---

const VIEWPORT = { width: 1280, height: 720 }
const TIMEOUT_MS = 30_000
const MAX_TEXT_LENGTH = 4000

let browser: Browser | null = null
let page: Page | null = null

async function ensurePage(): Promise<Page> {
  if (page && !page.isClosed()) return page
  if (!browser) {
    browser = await chromium.launch({ headless: true })
  }
  page = await browser.newPage({ viewport: VIEWPORT })
  return page
}

interface PageLink {
  readonly label: string
  readonly url: string
}

interface PageInput {
  readonly ref: number
  readonly type: string
  readonly placeholder: string
}

interface PageResult {
  readonly url: string
  readonly title: string
  readonly text: string
  readonly links: readonly PageLink[]
  readonly inputs: readonly PageInput[]
}

async function extractPage(p: Page): Promise<PageResult> {
  const url = p.url()
  const title = await p.title()

  const text = await p.evaluate(() => document.body?.innerText || '')

  const links: PageLink[] = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .map((a) => ({
        label: (a.textContent || '').trim().slice(0, 80),
        url: (a as HTMLAnchorElement).href,
      }))
      .filter((l) => l.label && l.url.startsWith('http'))
      .slice(0, 30)
  })

  const inputs: PageInput[] = await p.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea, select'))
      .map((el, i) => {
        const input = el as HTMLInputElement
        return {
          ref: i,
          type: input.type || el.tagName.toLowerCase(),
          placeholder: input.placeholder || input.name || '',
        }
      })
      .slice(0, 20)
  })

  return {
    url,
    title: title || url,
    text: text.slice(0, MAX_TEXT_LENGTH),
    links,
    inputs,
  }
}

function formatPageResult(result: PageResult): string {
  const lines = [
    `URL: ${result.url}`,
    `Title: ${result.title}`,
    '',
    '--- Content ---',
    result.text,
  ]

  if (result.links.length > 0) {
    lines.push('', '--- Links ---')
    for (let i = 0; i < result.links.length; i++) {
      lines.push(`[${i}] ${result.links[i].label} → ${result.links[i].url}`)
    }
  }

  if (result.inputs.length > 0) {
    lines.push('', '--- Inputs ---')
    for (const input of result.inputs) {
      lines.push(`[${input.ref}] type=${input.type} placeholder="${input.placeholder}"`)
    }
  }

  return lines.join('\n')
}

// --- Tool implementations ---

async function toolBrowse(url: string): Promise<string> {
  const p = await ensurePage()
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  const result = await extractPage(p)
  return formatPageResult(result)
}

async function toolSearch(query: string): Promise<string> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
  const p = await ensurePage()
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  const result = await extractPage(p)
  return formatPageResult(result)
}

async function toolScreenshot(url?: string): Promise<{ base64: string; mimeType: string }> {
  const p = await ensurePage()
  if (url) {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })
  }
  const buffer = await p.screenshot({ type: 'png' })
  return {
    base64: Buffer.from(buffer).toString('base64'),
    mimeType: 'image/png',
  }
}

async function toolClick(ref: number): Promise<string> {
  const p = await ensurePage()
  await p.evaluate((idx) => {
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .filter((a) => {
        const label = (a.textContent || '').trim()
        const href = (a as HTMLAnchorElement).href
        return label && href.startsWith('http')
      })
    const target = anchors[idx]
    if (target) (target as HTMLElement).click()
  }, ref)
  await p.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS }).catch(() => {})
  const result = await extractPage(p)
  return formatPageResult(result)
}

async function toolType(ref: number, text: string): Promise<string> {
  const p = await ensurePage()
  await p.evaluate(({ idx, value }) => {
    const elements = Array.from(document.querySelectorAll('input, textarea, select'))
    const target = elements[idx] as HTMLInputElement | undefined
    if (target) {
      target.focus()
      target.value = value
      target.dispatchEvent(new Event('input', { bubbles: true }))
      target.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, { idx: ref, value: text })
  const result = await extractPage(p)
  return formatPageResult(result)
}

async function toolSubmit(ref?: number): Promise<string> {
  const p = await ensurePage()
  await p.evaluate((idx) => {
    const elements = Array.from(document.querySelectorAll('input, textarea, select'))
    const target = idx !== undefined ? elements[idx] as HTMLInputElement | undefined : elements[0] as HTMLInputElement | undefined
    if (target) {
      target.focus()
      const form = target.closest('form')
      if (form) {
        form.submit()
      } else {
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      }
    }
  }, ref)
  await p.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS }).catch(() => {})
  const result = await extractPage(p)
  return formatPageResult(result)
}

async function toolBack(): Promise<string> {
  const p = await ensurePage()
  await p.goBack({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS }).catch(() => {})
  const result = await extractPage(p)
  return formatPageResult(result)
}

// --- MCP Server ---

const server = new Server(
  { name: 'browser', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browse',
      description: 'Navigate to a URL and return page content, links, and input fields',
      inputSchema: {
        type: 'object' as const,
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
        },
        required: ['url'],
      },
    },
    {
      name: 'search',
      description: 'Search Google and return results',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'screenshot',
      description: 'Take a screenshot of the current page (or navigate to URL first)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          url: { type: 'string', description: 'Optional URL to navigate to before screenshot' },
        },
      },
    },
    {
      name: 'click',
      description: 'Click a link by its index number (from browse results)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: { type: 'number', description: 'Link index from the links list' },
        },
        required: ['ref'],
      },
    },
    {
      name: 'type_text',
      description: 'Type text into an input field by its index number',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: { type: 'number', description: 'Input field index' },
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['ref', 'text'],
      },
    },
    {
      name: 'submit',
      description: 'Submit a form (press Enter on an input field)',
      inputSchema: {
        type: 'object' as const,
        properties: {
          ref: { type: 'number', description: 'Optional input field index to submit from' },
        },
      },
    },
    {
      name: 'back',
      description: 'Go back to the previous page',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args ?? {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'browse': {
        const text = await toolBrowse(String(a.url))
        return { content: [{ type: 'text', text }] }
      }
      case 'search': {
        const text = await toolSearch(String(a.query))
        return { content: [{ type: 'text', text }] }
      }
      case 'screenshot': {
        const result = await toolScreenshot(a.url ? String(a.url) : undefined)
        return { content: [{ type: 'image', data: result.base64, mimeType: result.mimeType }] }
      }
      case 'click': {
        const text = await toolClick(Number(a.ref))
        return { content: [{ type: 'text', text }] }
      }
      case 'type_text': {
        const text = await toolType(Number(a.ref), String(a.text))
        return { content: [{ type: 'text', text }] }
      }
      case 'submit': {
        const text = await toolSubmit(a.ref !== undefined ? Number(a.ref) : undefined)
        return { content: [{ type: 'text', text }] }
      }
      case 'back': {
        const text = await toolBack()
        return { content: [{ type: 'text', text }] }
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true }
  }
})

// --- Cleanup on exit ---

process.on('SIGINT', async () => {
  if (page && !page.isClosed()) await page.close().catch(() => {})
  if (browser) await browser.close().catch(() => {})
  process.exit(0)
})

// --- Start ---

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP browser server failed:', err)
  process.exit(1)
})
