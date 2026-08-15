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
 * so multiple SystemInfo widgets share one fetch. Refreshed manually or every
 * 60s (in case hot-plug / dock changes things).
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
      setLoading(true)
      setError(null)
      try {
        if (!_cache) {
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
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    // Refresh every 60s in case of hot-plug (rare; info is mostly static).
    const id = setInterval(load, 60_000)
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
