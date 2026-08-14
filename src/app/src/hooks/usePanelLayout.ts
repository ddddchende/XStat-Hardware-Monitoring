import { useReducer, useEffect } from 'react'
import type { PanelLayout, PanelWidget, LayoutItem, WidgetType } from '@/types/panel'
import { WIDGET_DEFAULTS } from '@/types/panel'

export const STORAGE_KEY = 'xstat:panels:v4'
const SERVICE_BASE = 'http://localhost:9421'

export const CUSTOM_DEFAULT_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  /*
   * ─── STYLES ──────────────────────────────────────────────────────────────
   * This is regular CSS. You can change colours, fonts, sizes — anything here
   * controls how your widget looks.
   */

  /* Remove default browser spacing from all elements */
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /*
   * The widget fills its container. "background: transparent" lets the panel
   * background or image show through behind your widget.
   * The flex layout centres your content both horizontally and vertically.
   */
  body {
    background: transparent;
    overflow: hidden;
    font-family: Inter, system-ui, sans-serif;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
  }

  /* Small grey label shown above the value (e.g. "CPU Package") */
  #label { font-size: 11px; color: rgba(255,255,255,0.45); margin-bottom: 6px; }

  /* The big number in the middle — change the color to whatever you like */
  #value { font-size: 36px; font-weight: 700; color: #03dac6; }

  /* The unit shown after the number (e.g. "°C", "%", "MHz") */
  #unit  { font-size: 15px; color: rgba(255,255,255,0.5); margin-left: 4px; }
</style></head><body>

  <!--
    ─── HTML ──────────────────────────────────────────────────────────────────
    This is the visible structure of your widget.
    The three elements below are updated automatically by the script further down.
    You can rename the ids (label / value / unit) as long as you update the
    matching getElementById calls in the <script> section too.
  -->
  <div id="label">CPU Package</div>
  <div><span id="value">--</span><span id="unit">°C</span></div>

  <script>
    /*
     * ─── SCRIPT ────────────────────────────────────────────────────────────
     * XStat sends live sensor data to this widget via window.postMessage
     * every time it reads your hardware (by default every 1 second).
     *
     * You don't need to fetch anything yourself — just listen for the message
     * event below and pull the values you want out of the sensors array.
     *
     * Each sensor object looks like this:
     * {
     *   id:           "unique/path/to/sensor",   ← internal hardware path
     *   name:         "CPU Package",              ← use this to find the sensor
     *   category:     "CPU",                      ← hardware category
     *   type:         "Temperature",              ← sensor type (Load, Fan, etc.)
     *   value:        42.3,                       ← current reading (null if unavailable)
     *   unit:         "°C",                       ← unit string
     *   hardwareName: "AMD Ryzen 9 5900X"         ← the hardware it belongs to
     * }
     *
     * TIP: Open the Sensors list (button at the top of this editor) to browse
     * every available sensor name on your system and click to copy it.
     */
    window.addEventListener('message', function(e) {
      var sensors = e.data && e.data.sensors;
      if (!sensors) return; // ignore unrelated messages

      // Find the sensor whose name matches — change 'CPU Package' to any name
      // from the Sensors list to display a different reading.
      var s = sensors.find(function(x) { return x.name === 'CPU Package'; });

      if (s) {
        // toFixed(1) shows one decimal place — use toFixed(0) for whole numbers
        document.getElementById('value').textContent = s.value != null ? s.value.toFixed(1) : '--';
        document.getElementById('unit').textContent  = s.unit || '';
        document.getElementById('label').textContent = s.name;
      }
    });
  </script>
</body></html>`

/** Push layout to the service, retrying a few times on failure (handles startup race). */
export async function pushLayoutToService(layout: PanelLayout, retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${SERVICE_BASE}/api/panel-layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layout),
      })
      if (r.ok || r.status === 204) return
    } catch { /* not running yet */ }
    await new Promise(r => setTimeout(r, 800 * (i + 1)))
  }
}

export interface PanelsState {
  panels: PanelLayout[]
  activePanelId: string
}

function makeDefaultPanel(): PanelLayout {
  return {
    id: 'default',
    name: 'My Panel',
    canvasWidth: 800,
    canvasHeight: 600,
    canvasBackground: '#0d0d10',
    canvasShowGrid: true,
    widgets: [],
    layout: [],
  }
}

function makeDefaultWidget(type: WidgetType): PanelWidget {
  const base: PanelWidget = { id: crypto.randomUUID(), type }
  switch (type) {
    case 'SensorBar':
      return { ...base, min: 0, max: 100, color: '#7c6ef5', variant: 'flat' }
    case 'SensorGauge':
      return { ...base, min: 0, max: 100, color: '#7c6ef5', variant: 'arc' }
    case 'SensorValue':
      return { ...base, color: '#03dac6' }
    case 'SensorSparkline':
      return { ...base, color: '#03dac6', variant: 'area' }
    case 'Clock':
      return { ...base, color: '#ffffff', clockFormat: '24h', showDate: false, showSeconds: true }
    case 'Text':
      return { ...base, color: '#ffffff', text: '', textAlign: 'left', fontWeight: 'normal' }
    case 'Custom':
      return { ...base, customHtml: CUSTOM_DEFAULT_HTML }
    case 'Image':
      return { ...base, imageObjectFit: 'contain', imageOpacity: 1 }
    case 'Box':
      return { ...base, boxFill: '#0D0D10', boxBorderColor: '#252933', boxBorderWidth: 1, boxRadius: 12 }
    case 'SystemInfo':
      return { ...base, sysShowCpu: true, sysShowGpu: true, sysShowRamTotal: true, sysShowRamSpeed: true, sysShowOs: true, sysShowDisks: true }
    case 'SensorList':
      return { ...base }
  }
}

function loadState(): PanelsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PanelsState
      if (Array.isArray(parsed.panels) && parsed.panels.length > 0) return parsed
    }
  } catch { /* ignore */ }
  const def = makeDefaultPanel()
  return { panels: [def], activePanelId: def.id }
}

export function usePanelLayout() {
  // Undo/redo model: present = current PanelsState; past = prior snapshots
  // (undo source); future = snapshots undone but re-doable (redo source).
  // Only editing operations push to past; switching active panel is navigation
  // and does not record history (so undo targets the most recent edit, not view jumps).
  type UndoState = { present: PanelsState; past: PanelsState[]; future: PanelsState[] }

  type Action =
    | { type: 'COMMIT'; updater: (s: PanelsState) => PanelsState }
    | { type: 'NAV'; activePanelId: string }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'LOAD'; state: PanelsState }

  const HISTORY_LIMIT = 100

  function reducer(state: UndoState, action: Action): UndoState {
    switch (action.type) {
      case 'COMMIT': {
        const next = action.updater(state.present)
        if (next === state.present) return state
        // A new edit clears the redo future (standard undo/redo semantics).
        return {
          present: next,
          past: [...state.past, state.present].slice(-HISTORY_LIMIT),
          future: [],
        }
      }
      case 'NAV':
        return { ...state, present: { ...state.present, activePanelId: action.activePanelId } }
      case 'UNDO': {
        if (state.past.length === 0) return state
        const previous = state.past[state.past.length - 1]
        return {
          present: previous,
          past: state.past.slice(0, -1),
          future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
        }
      }
      case 'REDO': {
        if (state.future.length === 0) return state
        const next = state.future[0]
        return {
          present: next,
          past: [...state.past, state.present].slice(-HISTORY_LIMIT),
          future: state.future.slice(1),
        }
      }
      case 'LOAD': {
        // Loading a workspace from a file replaces the present state entirely
        // and resets the undo/redo history — it's a document switch, not an edit.
        return { present: action.state, past: [], future: [] }
      }
      default:
        return state
    }
  }

  const [undoState, dispatch] = useReducer(reducer, undefined, () => ({
    present: loadState(),
    past: [],
    future: [],
  }))
  const state = undoState.present

  // Persist on every state change, and push the active panel to the local service
  // so the LAN web panel can display it.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    const active = state.panels.find(p => p.id === state.activePanelId) ?? state.panels[0]
    pushLayoutToService(active)
  }, [state])

  const activePanel =
    state.panels.find(p => p.id === state.activePanelId) ?? state.panels[0]

  // Wrap an updater as a history-recording commit.
  function commit(updater: (s: PanelsState) => PanelsState) {
    dispatch({ type: 'COMMIT', updater })
  }

  const canUndo = undoState.past.length > 0
  function undo() {
    dispatch({ type: 'UNDO' })
  }

  const canRedo = undoState.future.length > 0
  function redo() {
    dispatch({ type: 'REDO' })
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  function updateLayout(layout: LayoutItem[]) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id ? { ...p, layout } : p
      ),
    }))
  }

  // ── Widgets ───────────────────────────────────────────────────────────────
  function addWidget(type: WidgetType, overrides?: Partial<PanelWidget>): string {
    const widget = overrides ? { ...makeDefaultWidget(type), ...overrides } : makeDefaultWidget(type)
    const { w, h } = WIDGET_DEFAULTS[type]
    // Stagger new widgets so they don't all pile on top of each other
    const n = activePanel.layout.length
    const x = 10 + (n % 8) * 20
    const y = 10 + (n % 8) * 20
    const item: LayoutItem = { i: widget.id, x, y, w, h }

    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? { ...p, widgets: [...p.widgets, widget], layout: [...p.layout, item] }
          : p
      ),
    }))
    return widget.id
  }

  function updateWidget(widgetId: string, updates: Partial<PanelWidget>) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? { ...p, widgets: p.widgets.map(w => w.id === widgetId ? { ...w, ...updates } : w) }
          : p
      ),
    }))
  }

  function removeWidget(widgetId: string) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? {
              ...p,
              widgets: p.widgets.filter(w => w.id !== widgetId),
              layout: p.layout.filter(l => l.i !== widgetId),
            }
          : p
      ),
    }))
  }

  // Remove several widgets in a single history commit (one undo step).
  function removeWidgets(widgetIds: string[]) {
    if (widgetIds.length === 0) return
    const ids = new Set(widgetIds)
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? {
              ...p,
              widgets: p.widgets.filter(w => !ids.has(w.id)),
              layout: p.layout.filter(l => !ids.has(l.i)),
            }
          : p
      ),
    }))
  }

  // Apply geometry updates to several widgets in a single history commit
  // (one undo step for a whole group move/resize).
  function updateWidgetGeometries(updates: Array<{ id: string; geom: Partial<Omit<LayoutItem, 'i'>> }>) {
    if (updates.length === 0) return
    const map = new Map(updates.map(u => [u.id, u.geom]))
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? { ...p, layout: p.layout.map(l => (map.has(l.i) ? { ...l, ...map.get(l.i) } : l)) }
          : p
      ),
    }))
  }

  // Clone a widget (new UUID) and offset its layout position by 20px.
  // Returns the new widget's id, or null if the source widget was not found.
  function duplicateWidget(widgetId: string): string | null {
    const ids = duplicateWidgets([widgetId])
    return ids[0] ?? null
  }

  // Clone several widgets (new UUIDs, each offset by 20px) in a single history
  // commit. Returns the new widgets' ids in the same order as the input.
  function duplicateWidgets(widgetIds: string[]): string[] {
    const created: { widget: PanelWidget; item: LayoutItem }[] = []
    for (const wid of widgetIds) {
      const sourceWidget = activePanel.widgets.find(w => w.id === wid)
      const sourceLayout = activePanel.layout.find(l => l.i === wid)
      if (!sourceWidget || !sourceLayout) continue

      const newId = crypto.randomUUID()
      // Deep-clone widget props (customFiles / nested records shouldn't be shared by ref)
      const clonedWidget: PanelWidget = {
        ...sourceWidget,
        id: newId,
        ...(sourceWidget.customFiles
          ? { customFiles: { ...sourceWidget.customFiles } }
          : {}),
      }
      created.push({
        widget: clonedWidget,
        item: {
          ...sourceLayout,
          i: newId,
          x: sourceLayout.x + 20,
          y: sourceLayout.y + 20,
        },
      })
    }
    if (created.length === 0) return []

    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? {
              ...p,
              widgets: [...p.widgets, ...created.map(c => c.widget)],
              layout: [...p.layout, ...created.map(c => c.item)],
            }
          : p
      ),
    }))
    return created.map(c => c.widget.id)
  }

  // Import a widget previously exported as .xstatwidget. Generates a fresh UUID and a
  // default layout position so it lands cleanly in the current panel.
  function importWidget(data: { version?: number; widget: PanelWidget }): string | null {
    const src = data.widget
    if (!src || !src.type) return null
    const newId = crypto.randomUUID()
    const widget: PanelWidget = {
      ...src,
      id: newId,
      type: src.type,
      ...(src.customFiles ? { customFiles: { ...src.customFiles } } : {}),
    }
    const def = WIDGET_DEFAULTS[src.type]
    const { w, h } = def ?? { w: 6, h: 4 }
    const n = activePanel.layout.length
    const item: LayoutItem = { i: newId, x: 10 + (n % 8) * 20, y: 10 + (n % 8) * 20, w, h }

    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? { ...p, widgets: [...p.widgets, widget], layout: [...p.layout, item] }
          : p
      ),
    }))
    return newId
  }

  function updateWidgetGeometry(widgetId: string, geom: Partial<Omit<LayoutItem, 'i'>>) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id
          ? { ...p, layout: p.layout.map(l => l.i === widgetId ? { ...l, ...geom } : l) }
          : p
      ),
    }))
  }

  // ── Panels ────────────────────────────────────────────────────────────────
  function createPanel(name: string) {
    const panel = { ...makeDefaultPanel(), id: crypto.randomUUID(), name }
    commit(s => ({ panels: [...s.panels, panel], activePanelId: panel.id }))
  }

  function deletePanel(id: string) {
    commit(s => {
      const remaining = s.panels.filter(p => p.id !== id)
      // Always keep at least one panel
      if (remaining.length === 0) {
        const def = makeDefaultPanel()
        return { panels: [def], activePanelId: def.id }
      }
      const newActive = s.activePanelId === id ? remaining[0].id : s.activePanelId
      return { panels: remaining, activePanelId: newActive }
    })
  }

  function renamePanel(name: string) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id ? { ...p, name } : p
      ),
    }))
  }

  function setActivePanel(id: string) {
    dispatch({ type: 'NAV', activePanelId: id })
  }

  function updateCanvasBackground(color: string) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id ? { ...p, canvasBackground: color } : p
      ),
    }))
  }

  function updateCanvasSettings(updates: { canvasBackground?: string; canvasBackgroundImage?: string | null; canvasShowGrid?: boolean; canvasGridColor?: string; locked?: boolean }) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id ? { ...p, ...updates } : p
      ),
    }))
  }

  function updateCanvasSize(canvasWidth: number, canvasHeight: number) {
    commit(s => ({
      ...s,
      panels: s.panels.map(p =>
        p.id === activePanel.id ? { ...p, canvasWidth, canvasHeight } : p
      ),
    }))
  }

  // ── Import / Export ───────────────────────────────────────────────────────
  function exportPanel(): string {
    return JSON.stringify(activePanel, null, 2)
  }

  function importPanel(json: string): boolean {
    try {
      const panel = JSON.parse(json) as PanelLayout
      if (!panel.name || !Array.isArray(panel.widgets)) return false
      panel.id = crypto.randomUUID()
      // Migrate older exports that may lack canvas dimensions
      panel.canvasWidth  = panel.canvasWidth  ?? 800
      panel.canvasHeight = panel.canvasHeight ?? 600
      panel.canvasShowGrid = panel.canvasShowGrid ?? true
      commit(s => ({ panels: [...s.panels, panel], activePanelId: panel.id }))
      return true
    } catch {
      return false
    }
  }

  // ── Workspace file (Open / Save / Save As) ───────────────────────────────
  // A workspace file stores the entire PanelsState (all panels + activePanelId),
  // so opening it restores the full document. exportPanel/importPanel above
  // remain for single-panel share; workspace methods operate on the whole doc.
  function exportWorkspace(): string {
    return JSON.stringify(state, null, 2)
  }

  function loadWorkspace(next: PanelsState) {
    dispatch({ type: 'LOAD', state: next })
  }

  return {
    panels: state.panels,
    activePanel,
    updateLayout,
    addWidget,
    updateWidget,
    removeWidget,
    removeWidgets,
    duplicateWidget,
    duplicateWidgets,
    importWidget,
    updateWidgetGeometry,
    updateWidgetGeometries,
    createPanel,
    deletePanel,
    renamePanel,
    setActivePanel,
    updateCanvasBackground,
    updateCanvasSettings,
    updateCanvasSize,
    exportPanel,
    importPanel,
    exportWorkspace,
    loadWorkspace,
    undo,
    canUndo,
    redo,
    canRedo,
  }
}
