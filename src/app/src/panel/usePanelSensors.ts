import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as signalR from '@microsoft/signalr'
import type { HardwareSnapshot } from '@/types/sensors'
import type { PanelSubscribeRule } from './PanelSubscriptionContext'
import type { PanelLayout } from '@/types/panel'

/** Workspace shape pushed by the editor: { panels, activePanelId } (legacy single-panel payloads are wrapped server-side). */
interface WorkspaceState {
  panels: PanelLayout[]
  activePanelId: string
}

const ACTIVE_PANEL_KEY = 'xstat_active_panel'

function parseWorkspace(json: string): WorkspaceState | null {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed.panels) || parsed.panels.length === 0) return null
    return { panels: parsed.panels, activePanelId: parsed.activePanelId ?? parsed.panels[0].id }
  } catch { return null }
}

/**
 * Variant of useSensors that derives the hub URL from window.location.origin
 * so the panel works on any device that opens http://{lan-ip}:9421/
 */
export function usePanelSensors() {
  const [snapshot, setSnapshot]   = useState<HardwareSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  // The editor pushes the whole workspace; the panel shows one panel at a time.
  const [workspaceJson, setWorkspaceJson] = useState<string | null>(null)
  const [currentPanelId, setCurrentPanelId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_PANEL_KEY),
  )
  // Server-side history (up to 60s) pulled once after subscribing — used to seed charts.
  const [historySeed, setHistorySeed] = useState<HardwareSnapshot[] | null>(null)
  const hubRef       = useRef<signalR.HubConnection | null>(null)
  const cleanedUpRef = useRef(false)
  // null = 未订阅（服务端推全量，兼容旧逻辑）；'all' = 明确要全量；数组 = 只订阅这些传感器
  const subscriptionRef = useRef<PanelSubscribeRule[] | 'all' | null>(null)

  // Resolve the workspace + which panel is currently shown.
  const workspace = useMemo<WorkspaceState | null>(
    () => (workspaceJson ? parseWorkspace(workspaceJson) : null),
    [workspaceJson],
  )
  const panels = workspace?.panels ?? []
  const shownPanel = useMemo<PanelLayout | null>(() => {
    if (!workspace) return null
    if (currentPanelId) {
      const picked = workspace.panels.find(p => p.id === currentPanelId)
      if (picked) return picked
    }
    return workspace.panels.find(p => p.id === workspace.activePanelId) ?? workspace.panels[0]
  }, [workspace, currentPanelId])
  // Same variable name as before so PanelApp keeps working unchanged.
  const layoutJson = useMemo(() => (shownPanel ? JSON.stringify(shownPanel) : null), [shownPanel])

  // Switch the displayed panel (e.g. from the triple-tap switcher).
  const switchPanel = useCallback((id: string) => {
    setCurrentPanelId(id)
    localStorage.setItem(ACTIVE_PANEL_KEY, id)
  }, [])

  // Fetch the workspace once on mount so the LAN panel shows the right view at load.
  useEffect(() => {
    fetch(`${window.location.origin}/api/panel-layout`)
      .then(r => (r.status === 204 ? null : r.text()))
      .then(json => {
        if (json) {
          setWorkspaceJson(json)
        }
      })
      .catch(() => {})
  }, [])

  // Push the current subscription to the service, then pull the history window
  // (reduced to the subscribed sensors). Safe to call before/after connection.
  const applySubscription = useCallback(async () => {
    const hub = hubRef.current
    if (!hub) return
    try {
      const sub = subscriptionRef.current
      if (sub === 'all' || sub === null) {
        await hub.invoke('SubscribeAll')
      } else {
        // 字符串规则 → sensorIds；对象规则 → conditions（与服务端 SensorFilter 对齐）
        const sensorIds: string[] = []
        const conditions: Record<string, string>[] = []
        for (const rule of sub) {
          if (typeof rule === 'string') sensorIds.push(rule)
          else conditions.push(rule)
        }
        await hub.invoke('Subscribe', { sensorIds, conditions })
      }
      const history = await hub.invoke('GetHistory')
      if (Array.isArray(history) && history.length > 0) setHistorySeed(history)
    } catch { /* 连接尚未就绪时忽略；connect() 完成后再调用 */ }
  }, [])

  const setSubscription = useCallback((rules: PanelSubscribeRule[] | 'all' | null) => {
    subscriptionRef.current = rules
    applySubscription()
  }, [applySubscription])

  const connect = useCallback(async () => {
    if (hubRef.current) return
    cleanedUpRef.current = false

    const hubUrl = `${window.location.origin}/hubs/sensors`

    const hub = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect([0, 1000, 3000, 5000])
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    hub.on('SensorSnapshot', (data: HardwareSnapshot) => {
      setSnapshot(data)
      setError(null)
    })

    hub.on('SensorHistory', (history: HardwareSnapshot[]) => {
      if (Array.isArray(history) && history.length > 0) setHistorySeed(history)
    })

    hub.on('LayoutUpdated', (json: string) => {
      setWorkspaceJson(json)
    })

    hub.onreconnected(() => {
      setConnected(true)
      applySubscription()
    })
    hub.onclose(() => setConnected(false))
    hubRef.current = hub

    try {
      await hub.start()
      if (!cleanedUpRef.current) {
        setConnected(true)
        setError(null)
        await applySubscription()
      }
    } catch {
      if (hubRef.current === hub) hubRef.current = null
      if (!cleanedUpRef.current) {
        setConnected(false)
        setError('Cannot reach XStat service.')
      }
    }
  }, [applySubscription])

  useEffect(() => {
    connect()
    return () => {
      cleanedUpRef.current = true
      const h = hubRef.current
      hubRef.current = null
      h?.stop()
    }
  }, [connect])

  return { snapshot, connected, error, layoutJson, panels, switchPanel, historySeed, setSubscription }
}
