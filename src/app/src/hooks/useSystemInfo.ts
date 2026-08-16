import { useEffect, useState } from 'react'
import type { SystemInfo } from '@/types/systemInfo'
import { getServiceBase } from '@/utils/getServiceBase'

export interface UseSystemInfoResult {
  info: SystemInfo | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Fetches static system info (CPU/GPU model, RAM, disks, OS). Cached in-module
 * so multiple SystemInfo widgets share one fetch. Re-fetched every 5s so the
 * Uptime value stays calibrated against the service's live WMI data (the widget
 * ticks locally by +1s between refreshes). Refresh failures keep showing the
 * last-known data instead of blanking the widget.
 */
let _cache: SystemInfo | null = null
let _fetching: Promise<SystemInfo | null> | null = null

export function useSystemInfo(): UseSystemInfoResult {
  const [info,    setInfo]    = useState<SystemInfo | null>(_cache)
  const [loading, setLoading] = useState(!_cache)
  const [error,  setError]  = useState<string | null>(null)
  const [tick,   setTick]   = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (cancelled) return
      try {
        if (!_fetching) {
          _fetching = getServiceBase()
            .then(base => fetch(`${base}/api/systeminfo`, { cache: 'no-cache' }))
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<SystemInfo> })
            .then(d => { _cache = d; return d })
            .catch(e => { _fetching = null; throw e })
        }
        const data = await _fetching
        _fetching = null
        if (cancelled) return
        setInfo(data)
        setError(null)
      } catch (err) {
        _fetching = null
        if (cancelled) return
        // Keep showing last-known data on refresh failures; only surface errors
        // when nothing has loaded successfully yet.
        if (!_cache) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled && !_cache) setLoading(false)
      }
    }

    load()
    // Re-fetch every 3s: keeps Uptime calibrated (service computes it live via
    // WMI LastBootUpTime) and catches hot-plug / dock changes. Static info is
    // cheap to query, so the short interval is fine.
    const id = setInterval(load, 3_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [tick])

  return {
    info,
    loading,
    error,
    refresh: () => { _cache = null; setTick(t => t + 1) },
  }
}

export function clearSystemInfoCache() { _cache = null; _fetching = null }
