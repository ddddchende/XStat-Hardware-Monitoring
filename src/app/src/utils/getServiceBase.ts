// Resolve the API base URL of the XStat hardware service per environment:
//  - Electron editor (file://) → main process via IPC (supports custom port)
//  - LAN panel browser (http(s)://host:port) → same origin
// The Electron port can be changed at runtime (Settings → 端口), so the async
// getServiceBase() always re-queries the main process and refreshes the cache.

let cachedBase: string | null = null

/**
 * Same-origin base for the web panel — works for LAN IP:port as well as a
 * reverse-proxied domain served on the default port (443/80), where
 * window.location.port is '' and must NOT be treated as "not a web page".
 * Returns null in Electron (file://) so the caller can fall back to the
 * main-process URL.
 */
function webOrigin(): string | null {
  const { protocol, origin } = window.location
  return protocol.startsWith('http') ? origin : null
}

/** Synchronous API base — web panel is same-origin; Electron uses the cached value. */
export function resolveApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:9421'
  return webOrigin() ?? cachedBase ?? 'http://localhost:9421'
}

/** Asynchronous API base — in Electron, always asks the main process for the live port. */
export async function getServiceBase(): Promise<string> {
  if (typeof window === 'undefined') return 'http://localhost:9421'
  const sameOrigin = webOrigin()
  if (sameOrigin) return sameOrigin
  if (window.xstat?.service?.getUrl) {
    try {
      cachedBase = await window.xstat.service.getUrl()
      return cachedBase
    } catch { /* fall through to cache / default */ }
  }
  return cachedBase ?? 'http://localhost:9421'
}
