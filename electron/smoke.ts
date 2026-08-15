// Phased end-to-end smoke test for MdReader.
//
// Runs the REAL IPC handlers, the REAL preload bridge, and the REAL renderer
// bundle (dist/index.html) inside a hidden Electron window, driven from the
// main process via webContents.executeJavaScript. A local HTTP server stands
// in for the AI provider's SSE endpoint.
//
// Uses an isolated userData directory so the developer's real conversations
// and API configuration are never touched.
//
//   npm run test:smoke
//
// Phases:
//   1. file read / path authorization / 20MB limit / GBK decoding
//   2. settings storage — key isolation, keep-key merge, clear
//   3. conversation persistence — path traversal, index, concurrent atomic writes
//   4. SSE streaming — complete / truncated / error payload / cancel / endpoint validation
//   5. renderer UI — boot without console errors, drag-drop file open, settings panel

import { app, BrowserWindow, ipcMain } from 'electron'
import { resolve } from 'path'
import { writeFile, rm, readFile, mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import http from 'http'
import { registerFileHandlers } from './ipc/fileHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerAiHandlers } from './ipc/aiHandlers'
import { setMainWindowGetter } from './ipc/security'

let passed = 0
let failed = 0
const consoleErrors: string[] = []
const consoleWarnings: string[] = []

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.error(`  ✗ ${name}`, extra ?? '')
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const watchDog = setTimeout(() => {
  console.error('SMOKE TIMEOUT — aborting')
  app.exit(1)
}, 90_000)

// ---- local SSE provider stand-in ----
function startSseServer(): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    if (!pathname.endsWith('/chat/completions')) {
      res.writeHead(404)
      res.end()
      return
    }
    const route = pathname.split('/')[1] ?? 'ok'
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    const send = (data: string) => res.write(`data: ${data}\n\n`)
    const delta = (content?: string, reasoning?: string) =>
      send(JSON.stringify({ choices: [{ delta: { content, reasoning_content: reasoning } }] }))

    if (route === 'ok') {
      delta(undefined, 'think-1')
      delta('Hello ')
      delta('from ')
      delta(undefined, 'think-2')
      delta('smoke server')
      send('[DONE]')
      res.end()
    } else if (route === 'truncated') {
      delta('partial')
      res.end() // closes without [DONE]
    } else if (route === 'error') {
      send(JSON.stringify({ error: { message: 'rate limited by smoke' } }))
      res.end()
    } else if (route === 'slow') {
      delta('first')
      req.on('close', () => {
        try { res.end() } catch { /* already closed */ }
      })
    } else {
      res.end()
    }
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      resolvePromise({ port, close: () => server.close() })
    })
  })
}

async function main(): Promise<void> {
  // Isolated userData — never touch the developer's real data
  const smokeData = await mkdtemp(resolve(tmpdir(), 'mdreader-smoke-'))
  app.setPath('userData', smokeData)

  const sse = await startSseServer()
  const workDir = await mkdtemp(resolve(tmpdir(), 'mdreader-smoke-files-'))

  // temp files: utf-8 markdown, GBK-encoded markdown, an oversized file
  const utf8Path = resolve(workDir, 'hello.md')
  const gbkPath = resolve(workDir, 'gbk.md')
  const bigPath = resolve(workDir, 'big.md')
  await writeFile(utf8Path, '# Hello Smoke\n\nSome **content**.\n', 'utf-8')
  await writeFile(gbkPath, Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), 'binary') // "中文" in GBK
  await writeFile(bigPath, Buffer.alloc(21 * 1024 * 1024, 'a'), 'binary')

  registerFileHandlers(ipcMain)
  registerSettingsHandlers(ipcMain)
  registerAiHandlers(ipcMain)

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: resolve(__dirname, '../../dist-electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  setMainWindowGetter(() => win)

  win.webContents.on('console-message', (event) => {
    const e = event as unknown as { level: number; message: string }
    if (e.level >= 3) consoleErrors.push(e.message)
    else if (e.level === 2) consoleWarnings.push(e.message)
  })

  await win.loadFile(resolve(__dirname, '../../dist/index.html'))

  const run = <T = unknown>(code: string): Promise<T> =>
    win.webContents.executeJavaScript(code, true) as Promise<T>

  async function waitFor(desc: string, fn: () => Promise<boolean>, timeoutMs = 15000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        if (await fn()) return
      } catch { /* not ready yet */ }
      await sleep(250)
    }
    throw new Error(`timeout waiting for ${desc}`)
  }

  // ══════════════ Phase 1: file read / authorization / size limit / encoding ══════════════
  console.log('\nPhase 1 — file handlers')
  {
    const unauthorized = await run<string>(`
      window.electronAPI.readFile(${JSON.stringify(utf8Path)}).then(
        () => 'resolved', (err) => String(err && err.message ? err.message : err))`)
    check('un-authorized read is rejected', unauthorized.includes('Failed to read file'), unauthorized)

    await run(`window.electronAPI.authorizePath(${JSON.stringify(workDir)})`)

    const content = await run<string>(`window.electronAPI.readFile(${JSON.stringify(utf8Path)}).then(r => r.content)`)
    check('authorized read returns content', content.includes('Hello Smoke'), content)

    const gbk = await run<string>(`window.electronAPI.readFile(${JSON.stringify(gbkPath)}).then(r => r.content)`)
    check('GBK file is decoded to 中文', gbk === '中文', JSON.stringify(gbk))

    const listing = await run<{ name: string }[]>(`window.electronAPI.readDir(${JSON.stringify(workDir)})`)
    check('readDir lists all three files', listing.length === 3, listing.map((l) => l.name))

    const tooBig = await run<string>(`
      window.electronAPI.readFile(${JSON.stringify(bigPath)}).then(
        () => 'resolved', (err) => String(err && err.message ? err.message : err))`)
    check('21MB file rejected with clear error', tooBig.includes('File too large'), tooBig)
  }

  // ══════════════ Phase 2: settings — key isolation / merge / clear ══════════════
  console.log('\nPhase 2 — settings & key isolation')
  {
    const initial = await run<unknown>(`window.electronAPI.loadApiConfig()`)
    check('loadApiConfig starts empty', initial === null, initial)

    await run(`window.electronAPI.saveApiConfig({ endpoint: 'https://api.example.com/v1', apiKey: 'sk-smoke-key', model: 'smoke-model' })`)
    const loaded = await run<Record<string, unknown>>(`window.electronAPI.loadApiConfig()`)
    check('hasKey true after save', loaded?.hasKey === true, loaded)
    check('endpoint/model round-trip', loaded?.endpoint === 'https://api.example.com/v1' && loaded?.model === 'smoke-model', loaded)
    check('apiKey never leaves the main process', !('apiKey' in (loaded ?? {})), loaded)

    await run(`window.electronAPI.saveApiConfig({ endpoint: 'https://api.example.com/v1', apiKey: '', model: 'smoke-model-2' })`)
    const merged = await run<Record<string, unknown>>(`window.electronAPI.loadApiConfig()`)
    check('empty key keeps the stored key (merge)', merged?.hasKey === true && merged?.model === 'smoke-model-2', merged)

    await run(`window.electronAPI.clearApiConfig()`)
    const cleared = await run<unknown>(`window.electronAPI.loadApiConfig()`)
    check('clearApiConfig removes everything', cleared === null, cleared)
  }

  // ══════════════ Phase 3: conversation persistence ══════════════
  console.log('\nPhase 3 — conversation persistence')
  {
    const traversal = await run<string>(`
      window.electronAPI.saveConversation('..\\\\evil', { title: 'x' }).then(
        () => 'resolved', (err) => String(err && err.message ? err.message : err))`)
    check('path-traversal id rejected', traversal.includes('Invalid conversation id'), traversal)

    const conv = {
      id: 'smoke-conv',
      title: 'Smoke Conversation',
      createdAt: 1,
      updatedAt: 1000,
      nodes: {},
      rootId: null,
      activeNodeId: null,
    }
    await run(`window.electronAPI.saveConversation('smoke-conv', ${JSON.stringify(conv)})`)

    const list = await run<{ id: string; title: string }[]>(`window.electronAPI.listConversations()`)
    check('listConversations contains saved conv', list.some((c) => c.id === 'smoke-conv' && c.title === 'Smoke Conversation'), list)

    const loadedConv = await run<Record<string, unknown>>(`window.electronAPI.loadConversation('smoke-conv')`)
    check('loadConversation round-trips', loadedConv?.id === 'smoke-conv' && loadedConv?.updatedAt === 1000, loadedConv)

    const indexExists = await readFile(resolve(smokeData, 'mdreader', 'conversations', 'index.json'), 'utf-8')
      .then(() => true).catch(() => false)
    check('index.json is maintained', indexExists)

    // 20 concurrent writes to the same conversation — all must succeed, file must stay valid JSON
    const concurrent = await run<boolean>(`
      Promise.all(Array.from({ length: 20 }, (_, i) =>
        window.electronAPI.saveConversation('smoke-conv', { id: 'smoke-conv', title: 'C' + i, updatedAt: i, nodes: {}, rootId: null, activeNodeId: null })
      )).then(() => true).catch(() => false)`)
    check('20 concurrent atomic writes all succeed', concurrent === true)
    const afterConcurrent = await run<Record<string, unknown>>(`window.electronAPI.loadConversation('smoke-conv')`)
    check('file intact after concurrent writes', typeof afterConcurrent?.updatedAt === 'number' && afterConcurrent?.id === 'smoke-conv', afterConcurrent)

    await run(`window.electronAPI.deleteConversation('smoke-conv')`)
    const afterDelete = await run<{ id: string }[]>(`window.electronAPI.listConversations()`)
    check('delete removes from index', !afterDelete.some((c) => c.id === 'smoke-conv'), afterDelete)
  }

  // ══════════════ Phase 4: SSE streaming protocol ══════════════
  console.log('\nPhase 4 — SSE streaming')
  {
    const base = `http://127.0.0.1:${sse.port}`
    await run(`window.electronAPI.saveApiConfig({ endpoint: ${JSON.stringify(base + '/ok/v1')}, apiKey: 'sk-smoke', model: 'smoke-model' })`)

    const streamResult = await run<string>(`
      new Promise((resolvePromise, rejectPromise) => {
        const chunks = [], reasonings = []
        const off = []
        const cleanup = () => off.forEach((f) => f())
        off.push(window.electronAPI.onAiChunk((d) => chunks.push(d.delta)))
        off.push(window.electronAPI.onAiReasoning((d) => reasonings.push(d.delta)))
        off.push(window.electronAPI.onAiDone(() => { cleanup(); resolvePromise(JSON.stringify({ text: chunks.join(''), reasoning: reasonings.join('') })) }))
        off.push(window.electronAPI.onAiError((d) => { cleanup(); rejectPromise(new Error(d.message)) }))
        window.electronAPI.aiChatStream('smoke-req-ok', [{ role: 'user', content: 'hi' }], { endpoint: ${JSON.stringify(base + '/ok/v1')}, model: 'smoke-model' })
      })`).catch((e) => { throw e })
    const parsed = JSON.parse(streamResult) as { text: string; reasoning: string }
    check('streamed content assembled in order', parsed.text === 'Hello from smoke server', parsed.text)
    check('reasoning_content streamed separately', parsed.reasoning === 'think-1think-2', parsed.reasoning)

    const truncated = await run<string>(`
      new Promise((resolvePromise) => {
        const off = []
        const cleanup = () => off.forEach((f) => f())
        off.push(window.electronAPI.onAiError((d) => { cleanup(); resolvePromise(d.message) }))
        off.push(window.electronAPI.onAiDone(() => { cleanup(); resolvePromise('DONE-SENT') }))
        window.electronAPI.aiChatStream('smoke-req-trunc', [{ role: 'user', content: 'hi' }], { endpoint: ${JSON.stringify(base + '/truncated/v1')}, model: 'smoke-model' })
      })`)
    check('truncated stream reports an error (not done)', truncated.includes('truncated'), truncated)

    const errorPayload = await run<string>(`
      new Promise((resolvePromise) => {
        const off = []
        const cleanup = () => off.forEach((f) => f())
        off.push(window.electronAPI.onAiError((d) => { cleanup(); resolvePromise(d.message) }))
        off.push(window.electronAPI.onAiDone(() => { cleanup(); resolvePromise('DONE-SENT') }))
        window.electronAPI.aiChatStream('smoke-req-err', [{ role: 'user', content: 'hi' }], { endpoint: ${JSON.stringify(base + '/error/v1')}, model: 'smoke-model' })
      })`)
    check('mid-stream error payload surfaces the message', errorPayload.includes('rate limited'), errorPayload)

    const cancelled = await run<string>(`
      new Promise((resolvePromise) => {
        const off = []
        const cleanup = () => off.forEach((f) => f())
        off.push(window.electronAPI.onAiChunk(() => {
          window.electronAPI.cancelAiStream('smoke-req-cancel')
        }))
        off.push(window.electronAPI.onAiCancelled(() => { cleanup(); resolvePromise('CANCELLED-EVENT') }))
        off.push(window.electronAPI.onAiDone(() => { cleanup(); resolvePromise('DONE-SENT') }))
        off.push(window.electronAPI.onAiError(() => { cleanup(); resolvePromise('ERROR-SENT') }))
        window.electronAPI.aiChatStream('smoke-req-cancel', [{ role: 'user', content: 'hi' }], { endpoint: ${JSON.stringify(base + '/slow/v1')}, model: 'smoke-model' })
      })`)
    check('cancel resolves with a cancelled event (stop deadlock fixed)', cancelled === 'CANCELLED-EVENT', cancelled)

    const insecure = await run<string>(`
      window.electronAPI.aiChat([{ role: 'user', content: 'hi' }], { endpoint: 'http://insecure.example.com/v1', model: 'm' }).then(
        () => 'resolved', (err) => String(err && err.message ? err.message : err))`)
    check('http endpoint rejected (https enforced)', insecure.includes('https'), insecure)

    const invalidUrl = await run<string>(`
      window.electronAPI.aiChat([{ role: 'user', content: 'hi' }], { endpoint: 'not-a-url', model: 'm' }).then(
        () => 'resolved', (err) => String(err && err.message ? err.message : err))`)
    check('invalid endpoint URL rejected', invalidUrl.includes('Invalid API endpoint'), invalidUrl)
  }

  // ══════════════ Phase 5: renderer UI — boot, drag-drop, settings panel ══════════════
  console.log('\nPhase 5 — renderer UI')
  {
    // reload so the renderer re-reads the API config saved in Phase 4 —
    // the real app loads config at startup, and the UI send flow gates on it
    win.webContents.reload()

    await waitFor('ActivityBar Explorer button', async () =>
      run<boolean>(`document.querySelector('[title="Explorer"]') !== null`))

    // drag-drop a markdown File onto the window — the real useDragDrop pipeline
    const dropped = await run<boolean>(`
      (() => {
        const file = new File(['# Smoke Heading\\n\\nBody **bold** text.\\n'], 'smoke-drop.md', { type: 'text/markdown' })
        const dt = new DataTransfer()
        dt.items.add(file)
        const opts = { bubbles: true, cancelable: true, dataTransfer: dt }
        window.dispatchEvent(new DragEvent('dragenter', opts))
        window.dispatchEvent(new DragEvent('drop', opts))
        return true
      })()`)
    check('drag-drop dispatched', dropped === true)

    await waitFor('dropped file rendered as heading', async () =>
      run<boolean>(`document.querySelector('h1#smoke-heading')?.textContent === 'Smoke Heading'`))
    check('markdown rendered (h1 with anchor id)', true)

    const bold = await run<boolean>(`document.querySelector('.markdown-body strong')?.textContent === 'bold'`)
    check('GFM bold rendered', bold === true)

    // ---- new interaction: selection shows a quote bubble, does NOT auto-open AI ----
    const selectionDone = await run<boolean>(`
      (() => {
        const para = document.querySelector('.markdown-body p')
        if (!para) return false
        const range = document.createRange()
        range.selectNodeContents(para)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        para.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
        return true
      })()`)
    check('selection dispatched', selectionDone === true)

    await waitFor('quote bubble appears at selection end', async () =>
      run<boolean>(`document.querySelector('[data-quote-bubble]') !== null`))
    const aiTabCountAfterSelect = await run<number>(`document.querySelectorAll('[title="ai://chat"]').length`)
    check('mouseup no longer auto-opens the AI window', aiTabCountAfterSelect === 0, aiTabCountAfterSelect)

    // ---- click the bubble → AI window opens (right) + chip appears ----
    await run(`document.querySelector('[data-quote-bubble]').click()`)
    await waitFor('AI window opens after quote click', async () =>
      run<boolean>(`document.querySelectorAll('[title="ai://chat"]').length === 1`))
    await waitFor('quote chip appears above the input', async () =>
      run<boolean>(`document.body.textContent.includes('📎')`))
    check('quote chip visible in ChatInput', true)

    // ---- ActivityBar 💬 → a SECOND independent AI window under the focused pane ----
    await run(`document.querySelector('[title="New AI Chat"]').click()`)
    await waitFor('second AI window opens', async () =>
      run<boolean>(`document.querySelectorAll('[title="ai://chat"]').length === 2`))
    check('two independent AI windows coexist', true)

    // ---- send from the focused window: quote attaches, chips clear, stream renders ----
    await run(`
      (() => {
        const ta = document.querySelector('textarea')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, 'hello smoke')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
    await run(`document.querySelector('[title="发送"]').click()`)
    await waitFor('streamed reply rendered', async () =>
      run<boolean>(`document.body.textContent.includes('Hello from smoke server')`))
    check('send streams a reply end-to-end', true)
    await waitFor('quote chips cleared after send', async () =>
      run<boolean>(`!document.body.textContent.includes('📎')`))
    check('pending quotes cleared after send', true)
    await waitFor('second window still shows its own empty conversation', async () =>
      run<boolean>(`document.body.textContent.includes('No messages yet')`))
    check('windows keep independent conversations', true)

    // settings panel via ActivityBar (exercises the R2 context split end-to-end)
    await run(`document.querySelector('[title="Settings"]').click()`)
    await waitFor('SettingsPanel renders', async () =>
      run<boolean>(`document.body.textContent.includes('API Endpoint')`))
    check('settings panel opens from ActivityBar', true)

    // the drag overlay must not be stuck after the drop (B20h counter reset)
    const overlay = await run<boolean>(`document.body.textContent.includes('Drop your Markdown file here')`)
    check('drag overlay cleared after drop', overlay === false)

    check('zero renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5))
    if (consoleWarnings.length > 0) {
      console.log(`  (info) ${consoleWarnings.length} console warnings (not failures)`)
    }
  }

  // ══════════════ teardown ══════════════
  sse.close()
  win.destroy()
  await rm(workDir, { recursive: true, force: true })
  await rm(smokeData, { recursive: true, force: true })
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  try {
    await main()
  } catch (err) {
    failed++
    console.error('\nFATAL:', err)
  }
  clearTimeout(watchDog)
  console.log(`\n══════════════════════════════════════════`)
  console.log(`SMOKE RESULT: ${passed} passed, ${failed} failed`)
  console.log(`══════════════════════════════════════════`)
  app.exit(failed > 0 ? 1 : 0)
})
