import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Menu,
  Tray,
  nativeImage,
  dialog,
} from 'electron'
import { join, resolve } from 'path'
import { spawn, execFile, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { networkInterfaces } from 'os'
import { readFileSync, writeFileSync, createWriteStream } from 'fs'

const execFileAsync = promisify(execFile)

// ── Persistent config ─────────────────────────────────────────────────────────
function configPath(): string { return join(app.getPath('userData'), 'xstat-config.json') }
interface AppConfig { port: number; startMinimized: boolean; startWithWindows: boolean }
function readAppConfig(): AppConfig {
  try { return { port: 9421, startMinimized: false, startWithWindows: false, ...JSON.parse(readFileSync(configPath(), 'utf8')) as Partial<AppConfig> } }
  catch { return { port: 9421, startMinimized: false, startWithWindows: false } }
}
function writeAppConfig(cfg: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
}

let appConfig    = readAppConfig()
let SERVICE_PORT = appConfig.port
let SERVICE_URL  = `http://localhost:${SERVICE_PORT}`
const IS_DEV       = !app.isPackaged

let mainWindow:     BrowserWindow | null = null
let splashWindow:   BrowserWindow | null = null
let tray:           Tray | null = null
let serviceProcess: ChildProcess | null = null
let widgetEditorWindow: BrowserWindow | null = null
let widgetEditorData:   unknown = null

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Hardware Service Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/** The hardware service exe bundled with this app install. */
function bundledServiceExePath(): string {
  return IS_DEV
    ? resolve(__dirname, '../../../XStat.Service/bin/Debug/net9.0/XStat.Service.exe')
    : join(process.resourcesPath, 'service', 'XStat.Service.exe')
}

/** True when the running service is the one bundled with this install. */
function isOurService(path?: string): boolean {
  if (!path) return false
  const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase()
  return normalize(path) === normalize(bundledServiceExePath())
}

/** Stop a stale service occupying the port (Windows service + leftover process). */
async function stopStaleService(pid?: number): Promise<void> {
  // 1. Try the registered Windows service (no-op when it isn't installed).
  await new Promise<void>((resolve) => {
    const sc = spawn('sc.exe', ['stop', 'XStatHardwareSvc'], { stdio: 'ignore' })
    sc.on('exit', () => resolve())
    sc.on('error', () => resolve())
  })
  // 2. Kill by pid when the service reported one.
  if (pid) { try { process.kill(pid) } catch { /* already gone */ } }
  // 3. Force-kill any leftover XStat.Service.exe. This is the critical fallback:
  //    stale services from older installs predate the /health processId field,
  //    so we can't kill them by pid — without this the new service can never
  //    bind the port and the old one keeps serving stale data forever.
  await new Promise<void>((resolve) => {
    const tk = spawn('taskkill.exe', ['/IM', 'XStat.Service.exe', '/F'], { stdio: 'ignore' })
    tk.on('exit', () => resolve())
    tk.on('error', () => resolve())
  })
  // 4. Wait for the port to free up.
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(SERVICE_URL + '/health')
      if (!res.ok) return
    } catch { return } // connection refused → port is free
    await new Promise((r) => setTimeout(r, 200))
  }
}

async function startService(): Promise<void> {
  // 1. Reuse an already-running service only when it's the version bundled with
  //    this install. A stale service from an older install must be replaced,
  //    otherwise backend changes (new sensors, fixes) never reach the UI.
  let hadStale = false
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 2000)
    const probe = await fetch(SERVICE_URL + '/health', { signal: controller.signal })
    clearTimeout(tid)
    if (probe.ok) {
      const json = await probe.json() as { isAdmin?: boolean; processId?: number; executablePath?: string }
      if (json.isAdmin !== false && isOurService(json.executablePath)) {
        console.log('[XStat] Reusing existing elevated service on', SERVICE_URL)
        return
      }
      if (json.isAdmin !== false) {
        console.warn('[XStat] Stale service detected (' + (json.executablePath ?? 'unknown') + ') — replacing with bundled version.')
      } else {
        console.warn('[XStat] Found non-elevated service — stopping it and spawning elevated version.')
      }
      hadStale = true
      await stopStaleService(json.processId)
    }
  } catch { /* not running — fall through */ }

  // 2. In production try to start the registered Windows Service first.
  //    The NSIS installer registers 'XStatHardwareSvc' running as LocalSystem.
  //    Skip when we just replaced a stale service: `sc start` would relaunch the
  //    OLD registered binary path, so spawn the bundled exe directly instead.
  //    Also skip when a custom port is configured: the Windows service starts
  //    without arguments and would always bind the default port (9421).
  if (!IS_DEV && !hadStale && SERVICE_PORT === 9421) {
    console.log('[XStat] Attempting to start Windows service...')
    await new Promise<void>((resolve) => {
      const sc = spawn('sc.exe', ['start', 'XStatHardwareSvc'], { stdio: 'ignore' })
      sc.on('exit', () => resolve())
      sc.on('error', () => resolve())
    })
    await waitForService(SERVICE_URL + '/health', 8000)
    try {
      const r = await fetch(SERVICE_URL + '/health')
      if (r.ok) { console.log('[XStat] Windows service is running.'); return }
    } catch { /* fall through to spawn */ }
    console.warn('[XStat] Windows service did not respond — falling back to direct spawn.')
  }

  // 3. Fall back: spawn service exe directly (dev mode or service not installed).
  //    Pass --ServicePort (not --urls): Program.cs reads the "ServicePort" config
  //    key and calls UseUrls() with it — UseUrls overrides any --urls argument.
  //    Service stdout/stderr is captured to a log file so startup failures
  //    (port in use, missing runtime, crash) are diagnosable.
  const exeName = bundledServiceExePath()

  console.log('[XStat] Starting hardware service:', exeName)
  const svcLog = createWriteStream(join(app.getPath('userData'), 'service.log'), { flags: 'a' })
  // stdio must use 'pipe' strings — Electron rejects WriteStream objects in the
  // stdio array ("The argument 'stdio' is invalid. Received WriteStream").
  serviceProcess = spawn(exeName, [`--ServicePort=${SERVICE_PORT}`], { detached: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  serviceProcess.stdout?.pipe(svcLog)
  serviceProcess.stderr?.pipe(svcLog)
  serviceProcess.on('error', (err) => {
    console.error('[XStat] Service error:', err.message)
    svcLog.write(`[spawn error] ${err.message}\n`)
  })
  serviceProcess.on('exit',  (code) => { console.log('[XStat] Service exited:', code); svcLog.end(); serviceProcess = null })

  // First start does full hardware enumeration (LHM + disk counters + WMI),
  // which can take well over 15s — give it plenty of time.
  await waitForService(SERVICE_URL + '/health', 30000)
}async function waitForService(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) { console.log('[XStat] Service is ready.'); return }
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.warn('[XStat] Service did not respond in time Ã¢â‚¬â€ continuing anyway.')
}

function stopService() {
  if (serviceProcess && !serviceProcess.killed) {
    serviceProcess.kill()
    serviceProcess = null
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Window Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 200,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (IS_DEV) {
    splashWindow.loadURL('http://localhost:5173/splash.html')
  } else {
    splashWindow.loadFile(join(__dirname, '../renderer/splash.html'))
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f0f11',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: join(__dirname, '../renderer/icon.ico'),
  })

  if (IS_DEV) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    splashWindow?.close()
    splashWindow = null
    if (!appConfig.startMinimized) mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Tray Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function createTray() {
  const icon = nativeImage.createFromPath(join(__dirname, '../renderer/icon.ico'))
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('XStat')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show XStat',          click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Open Panel in Browser', click: () => shell.openExternal(`${SERVICE_URL}/panel`) },
    { type: 'separator' },
    { label: 'Quit',                click: () => app.quit() },
  ]))
  tray.on('double-click', () => mainWindow?.show())
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ IPC handlers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close',  () => mainWindow?.hide())
ipcMain.handle('app:quit',      () => { stopService(); app.exit(0) })
ipcMain.handle('service:url',      () => SERVICE_URL)
ipcMain.handle('service:getPort',  () => SERVICE_PORT)
ipcMain.handle('service:setPort',  async (_event, port: number) => {
  port = Math.max(1024, Math.min(65535, Math.floor(port)))
  appConfig.port = port
  writeAppConfig(appConfig)
  SERVICE_PORT = port
  SERVICE_URL  = `http://localhost:${port}`
  // Fully stop the old service first (Windows service + leftover processes);
  // stopService() only kills a direct child process and would leave the old
  // service holding the previous port.
  await stopStaleService()
  await startService()
  return port
})
ipcMain.handle('service:panelUrl', () => {
  const nets = networkInterfaces()
  for (const iface of Object.values(nets)) {
    if (!iface) continue
    for (const net of iface) {
      if (!net.internal && net.family === 'IPv4') {
        return `http://${net.address}:${SERVICE_PORT}`
      }
    }
  }
  return `http://localhost:${SERVICE_PORT}`
})

ipcMain.handle('settings:getStartMinimized',   () => appConfig.startMinimized)
ipcMain.handle('settings:setStartMinimized',   (_event, value: boolean) => {
  appConfig.startMinimized = value
  writeAppConfig(appConfig)
})
ipcMain.handle('settings:getStartWithWindows', () => appConfig.startWithWindows)
ipcMain.handle('settings:setStartWithWindows', (_event, value: boolean) => {
  appConfig.startWithWindows = value
  writeAppConfig(appConfig)
  if (!IS_DEV) app.setLoginItemSettings({ openAtLogin: value, name: 'XStat' })
})

// ── Widget Editor window ──────────────────────────────────────────────────

ipcMain.handle('widget-editor:open', (_event, widget: unknown) => {
  widgetEditorData = widget

  // If the window is already open, just refresh it with the new widget data
  if (widgetEditorWindow && !widgetEditorWindow.isDestroyed()) {
    widgetEditorWindow.webContents.send('widget-editor:init', widget)
    widgetEditorWindow.focus()
    return
  }

  widgetEditorWindow = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth: 900,
    minHeight: 600,
    title: 'Custom Widget Editor — XStat',
    backgroundColor: '#0f0f11',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: join(__dirname, '../renderer/icon.ico'),
  })

  if (IS_DEV) {
    widgetEditorWindow.loadURL('http://localhost:5173/#/widget-editor')
  } else {
    widgetEditorWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/widget-editor' })
  }

  widgetEditorWindow.once('ready-to-show', () => {
    widgetEditorWindow?.setMenu(null)
    widgetEditorWindow?.show()
  })
  widgetEditorWindow.on('closed', () => { widgetEditorWindow = null })
})

ipcMain.handle('widget-editor:get-data', () => widgetEditorData)

ipcMain.handle('widget-editor:save', (_event, html: string, files: Record<string, string>) => {
  const widget = widgetEditorData as { id?: string } | null
  mainWindow?.webContents.send('widget-editor:saved', { widgetId: widget?.id ?? '', html, files })
})

ipcMain.handle('widget-editor:close',    () => widgetEditorWindow?.close())
ipcMain.handle('widget-editor:minimize', () => widgetEditorWindow?.minimize())
ipcMain.handle('widget-editor:maximize', () => {
  if (widgetEditorWindow?.isMaximized()) widgetEditorWindow.unmaximize()
  else widgetEditorWindow?.maximize()
})

// ── Workspace file dialogs (Open / Save / Save As) ───────────────────────
// Lets the editor treat a panel workspace as a regular file: open from disk,
// Ctrl+S to save back to the same file, Save As to pick a new location.
// Filters accept both the new workspace format ({panels, activePanelId}) and
// legacy single-panel .xstatpanel exports for back-compat on open.

ipcMain.handle('workspace:saveAs', async (_event, content: string) => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Workspace',
    defaultPath: 'workspace.xstatpanel',
    filters: [
      { name: 'XStat Workspace', extensions: ['xstatpanel', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePath) return { canceled: true as const }
  writeFileSync(result.filePath, content, 'utf8')
  return { canceled: false as const, filePath: result.filePath }
})

ipcMain.handle('workspace:save', (_event, filePath: string, content: string) => {
  try {
    writeFileSync(filePath, content, 'utf8')
    return { ok: true as const }
  } catch (err) {
    console.error('[XStat] workspace:save failed:', err)
    return { ok: false as const }
  }
})

ipcMain.handle('workspace:open', async () => {
  if (!mainWindow) return { canceled: true as const }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Workspace',
    properties: ['openFile'],
    filters: [
      { name: 'XStat Workspace', extensions: ['xstatpanel', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true as const }
  const filePath = result.filePaths[0]
  const content = readFileSync(filePath, 'utf8')
  return { canceled: false as const, filePath, content }
})

// Read a known path without showing a dialog — used to auto-reopen the last
// workspace file on startup.
ipcMain.handle('workspace:readFile', (_event, filePath: string) => {
  try {
    const content = readFileSync(filePath, 'utf8')
    return { ok: true as const, content }
  } catch (err) {
    console.error('[XStat] workspace:readFile failed:', err)
    return { ok: false as const }
  }
})

// ── Installed fonts (dynamic list for the font pickers) ─────────────────────
// Enumerates fonts actually installed on the OS via System.Drawing, so the
// editor's font dropdown shows real choices (incl. Chinese fonts) instead of a
// hardcoded list. Result is cached for the app's lifetime.
let _fontCache: string[] | null = null

ipcMain.handle('fonts:list', async () => {
  if (_fontCache) return _fontCache
  try {
    const script = [
      // Force UTF-8 so localized (Chinese) font names survive the pipe to Node.
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;',
      '$OutputEncoding = [System.Text.Encoding]::UTF8;',
      'Add-Type -AssemblyName System.Drawing;',
      '$f = (New-Object System.Drawing.Text.InstalledFontCollection).Families;',
      '$n = foreach ($x in $f) { try { $x.GetName([System.Globalization.CultureInfo]::CurrentUICulture.LCID) } catch { $x.Name } };',
      '$n | Sort-Object -Unique | ConvertTo-Json -Compress',
    ].join(' ')
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      timeout: 20_000,
      windowsHide: true,
    })
    const parsed = JSON.parse(stdout.trim())
    _fontCache = Array.isArray(parsed)
      ? parsed.filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
      : []
    return _fontCache
  } catch (err) {
    console.error('[XStat] fonts:list failed:', err)
    return []
  }
})

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ App lifecycle Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/**
 * NOTE: the renderer CSP deliberately has NO default-src / connect-src, so the
 * page may connect to the service on any localhost port (custom port support).
 * We must NOT rewrite index.html at load time — Electron 33 verifies asar file
 * integrity and a modified file makes the page fail to load (chrome-error page).
 */

app.whenReady().then(async () => {
  if (!IS_DEV) app.setLoginItemSettings({ openAtLogin: appConfig.startWithWindows, name: 'XStat' })
  createSplashWindow()
  await startService()
  createMainWindow()
  createTray()
})

app.on('window-all-closed', () => { /* tray-based - do not quit */ })

app.on('before-quit', () => {
  mainWindow?.removeAllListeners('close')
  stopService()
})

app.on('activate', () => {
  if (mainWindow === null) createMainWindow()
  else mainWindow.show()
})
