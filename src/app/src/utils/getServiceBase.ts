// Resolve the API base URL of the XStat hardware service per environment:
//  - Electron editor (file://) → main process via IPC (supports custom port)
//  - LAN panel browser (http(s)://host:port) → same origin
// The Electron port can be changed at runtime (Settings → 端口), so the async
// getServiceBase() always re-queries the main process and refreshes the cache.

let cachedBase: string | null = null

/** Synchronous API base — web panel is same-origin; Electron uses the cached value. */
export function resolveApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:9421'
  const { protocol, hostname, port } = window.location
  if (protocol.startsWith('http') && port) return `${protocol}//${hostname}:${port}`
  return cachedBase ?? 'http://localhost:9421'
}

/** Asynchronous API base — in Electron, always asks the main process for the live port. */
export async function getServiceBase(): Promise<string> {
  if (typeof window === 'undefined') return 'http://localhost:9421'
  const { protocol, hostname, port } = window.location
  if (protocol.startsWith('http') && port) return `${protocol}//${hostname}:${port}`
  if (window.xstat?.service?.getUrl) {
    try {
      cachedBase = await window.xstat.service.getUrl()
      return cachedBase
    } catch { /* fall through to cache / default */ }
  }
  return cachedBase ?? 'http://localhost:9421'
}
