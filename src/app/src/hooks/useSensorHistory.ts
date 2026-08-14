import { useRef, useState, useEffect, useCallback } from 'react'
import type { HardwareSnapshot, SensorReading } from '@/types/sensors'

export interface HistoryPoint {
  t: number   // timestamp ms
  v: number   // sensor value
}

const HISTORY_WINDOW_MS = 60_000 // keep the last 60s of samples
const MAX_POINTS = 600           // safety cap for very fast poll intervals (100ms → 60s = 600)

/**
 * Maintains a rolling history buffer per sensor id covering the last 60s.
 * Returns a map of { sensorId -> HistoryPoint[] }
 *
 * `seed` is an optional list of older snapshots (e.g. the server-side 60s
 * history window pushed to a newly connected LAN panel client). It is applied
 * once, merging into the buffer in timestamp order even when live snapshots
 * already arrived.
 */
export function useSensorHistory(snapshot: HardwareSnapshot | null, seed?: HardwareSnapshot[] | null) {
  const historyRef = useRef<Map<string, HistoryPoint[]>>(new Map())
  const [history, setHistory] = useState<Map<string, HistoryPoint[]>>(new Map())
  const seedRef = useRef<HardwareSnapshot[] | null>(null)

  // Insert a batch of snapshots into the buffer, keeping each sensor's points
  // sorted by timestamp. Live data arrives in order; a late seed is out-of-order
  // and gets inserted at the correct position. After the batch, each buffer is
  // trimmed to the 60s time window (+ a point cap).
  const pushSnapshots = useCallback((snaps: HardwareSnapshot[]) => {
    const map = historyRef.current
    for (const snap of snaps) {
      for (const sensor of snap.sensors) {
        if (sensor.value === null) continue
        const point = { t: snap.timestampMs, v: sensor.value }
        const existing = map.get(sensor.id) ?? []
        let buf: HistoryPoint[]
        if (existing.length === 0) {
          buf = [point]
        } else if (point.t >= existing[existing.length - 1].t) {
          buf = [...existing, point]
        } else {
          // Out-of-order (seed arrived after live data) — insert sorted.
          const idx = existing.findIndex(x => x.t > point.t)
          buf = idx < 0 ? [...existing, point] : [...existing.slice(0, idx), point, ...existing.slice(idx)]
        }
        // Always create a new array — existing arrays may be frozen by React state sharing
        map.set(sensor.id, buf)
      }
    }
    // Trim every sensor's buffer to the time window + point cap.
    for (const [id, buf] of map) {
      const last = buf[buf.length - 1]
      if (!last) continue
      const cutoff = last.t - HISTORY_WINDOW_MS
      let out = buf.filter(p => p.t >= cutoff)
      if (out.length > MAX_POINTS) out = out.slice(out.length - MAX_POINTS)
      map.set(id, out)
    }
  }, [])

  // Apply the server-side history seed once (idempotent under StrictMode remounts).
  useEffect(() => {
    if (!seed || seed.length === 0 || seedRef.current === seed) return
    seedRef.current = seed
    pushSnapshots(seed)
    setHistory(new Map(historyRef.current))
  }, [seed, pushSnapshots])

  useEffect(() => {
    if (!snapshot) return
    pushSnapshots([snapshot])
    setHistory(new Map(historyRef.current))
  }, [snapshot, pushSnapshots])

  return history
}

/**
 * Helper: get a named sensor from a snapshot by partial name + category.
 */
export function findSensor(
  sensors: SensorReading[],
  category: string,
  type: string,
  nameFragment: string
): SensorReading | undefined {
  return sensors.find(
    (s) =>
      s.category === category &&
      s.type === type &&
      s.name.toLowerCase().includes(nameFragment.toLowerCase())
  )
}

/**
 * Helper: get all sensors matching category + type, sorted by name.
 */
export function filterSensors(
  sensors: SensorReading[],
  category: string,
  type: string
): SensorReading[] {
  return sensors
    .filter((s) => s.category === category && s.type === type)
    .sort((a, b) => a.name.localeCompare(b.name))
}
