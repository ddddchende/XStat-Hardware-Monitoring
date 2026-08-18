import { useEffect, useRef, useState, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import type { HardwareSnapshot } from '@/types/sensors'
import { getServiceBase } from '@/utils/getServiceBase'

export function useSensors() {
  const [snapshot, setSnapshot] = useState<HardwareSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hubRef      = useRef<signalR.HubConnection | null>(null)
  // Tracks whether the effect cleanup ran — lets us distinguish a
  // StrictMode-caused stop() from a genuine connection failure.
  const cleanedUpRef = useRef(false)
  // Retry timer for the initial connection — the service can still be
  // starting up (slow first hardware enumeration) when the renderer first
  // tries to connect, so keep retrying instead of failing forever.
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Throttle sensor snapshot updates when the window is not visible (minimized /
  // hidden to tray). While hidden, snapshots are buffered and applied at most
  // once every 10 seconds, significantly reducing React re-renders and CPU usage.
  // When the window becomes visible again the latest snapshot is applied immediately.
  const pendingSnapshotRef = useRef<HardwareSnapshot | null>(null)
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const throttledSetSnapshot = useCallback((data: HardwareSnapshot) => {
    if (!document.hidden) {
      // Window visible — apply immediately, cancel any pending throttle timer.
      if (throttleTimerRef.current) { clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null }
      pendingSnapshotRef.current = null
      setSnapshot(data)
    } else {
      // Window hidden — buffer latest snapshot, apply at most every 10 seconds.
      pendingSnapshotRef.current = data
      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null
          if (pendingSnapshotRef.current) {
            setSnapshot(pendingSnapshotRef.current)
            pendingSnapshotRef.current = null
          }
        }, 10_000)
      }
    }
  }, [])

  const connect = useCallback(async () => {
    if (hubRef.current) return
    cleanedUpRef.current = false

    // Schedule another connection attempt shortly — the service can still be
    // starting up (slow first hardware enumeration) at this point.
    const scheduleRetry = () => {
      if (retryTimerRef.current) return
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null
        connect()
      }, 3000)
    }

    let hub: signalR.HubConnection
    try {
      hub = new signalR.HubConnectionBuilder()
        .withUrl(`${await getServiceBase()}/hubs/sensors`)
        .withAutomaticReconnect([0, 1000, 3000, 5000])
        .configureLogging(signalR.LogLevel.None)
        .build()
    } catch {
      // getServiceBase() failed — retry shortly (service may not be up yet).
      if (!cleanedUpRef.current) scheduleRetry()
      return
    }

    hub.on('SensorSnapshot', (data: HardwareSnapshot) => {
      throttledSetSnapshot(data)
      setError(null)
    })

    // The service broadcasts LayoutUpdated to all connected clients.
    // The Electron app doesn't need it (only the LAN panel page does),
    // but we must register a handler to silence the SignalR "no method found" warning.
    hub.on('LayoutUpdated', () => {})

    hub.onreconnected(() => setConnected(true))
    hub.onclose(() => setConnected(false))

    hubRef.current = hub

    try {
      await hub.start()
      if (!cleanedUpRef.current) {
        setConnected(true)
        setError(null)
      }
    } catch (err) {
      // If cleanup ran before start() resolved, the stop() call caused this
      // failure — it is not a real error (React StrictMode dev artifact).
      if (hubRef.current === hub) hubRef.current = null
      if (!cleanedUpRef.current) {
        setConnected(false)
        setError('Cannot reach XStat service. Make sure it is running.')
        console.error('[useSensors] connect failed:', err)
        scheduleRetry()
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      cleanedUpRef.current = true
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null }
      if (throttleTimerRef.current) { clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null }
      const h = hubRef.current
      hubRef.current = null
      h?.stop()
    }
  }, [connect])

  // Flush buffered snapshot when the window becomes visible again.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden && pendingSnapshotRef.current) {
        if (throttleTimerRef.current) { clearTimeout(throttleTimerRef.current); throttleTimerRef.current = null }
        setSnapshot(pendingSnapshotRef.current)
        pendingSnapshotRef.current = null
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return { snapshot, connected, error, reconnect: connect }
}
