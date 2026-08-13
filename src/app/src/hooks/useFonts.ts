import { useEffect, useState } from 'react'

// Fonts installed on the OS, enumerated by the Electron main process (localized
// names, includes Chinese fonts). Cached in-module so every font picker shares
// one IPC call. Falls back to [] when running outside Electron (e.g. LAN panel),
// where callers keep their hardcoded fallback list.
let _fonts: string[] | null = null
let _fetching: Promise<string[]> | null = null

export function useFonts(): string[] {
  const [fonts, setFonts] = useState<string[]>(_fonts ?? [])

  useEffect(() => {
    if (_fonts) { setFonts(_fonts); return }
    if (!window.xstat?.fonts) return
    if (!_fetching) {
      _fetching = window.xstat.fonts.list()
        .then(list => { _fonts = list; return list })
        .catch(() => { _fetching = null; return [] })
    }
    _fetching.then(list => setFonts(list))
  }, [])

  return fonts
}
