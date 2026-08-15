import type { PanelWidget } from '@/types/panel'
import { getServiceBase } from '@/utils/getServiceBase'

// ── Font transfer to remote browsers ──────────────────────────────────────────
// The desktop editor lets the user pick any font installed on the machine (incl.
// custom Chinese fonts). A LAN panel browser usually doesn't have that font, so
// the renderer loads it from the service (which runs on the same machine that
// hosts the fonts) via a dynamic @font-face and serves it to the browser.
//
// Fonts already present in the browser (document.fonts.check) are skipped.

// Same API-base resolution as useSystemInfo.

// Dedupe font families referenced across all widget style fields.
export function collectPanelFonts(widgets: PanelWidget[]): string[] {
  const set = new Set<string>()
  for (const w of widgets) {
    for (const f of [w.fontFamily, w.labelFontFamily, w.valueFontFamily, w.unitFontFamily]) {
      if (f && f.trim()) set.add(f.trim())
    }
  }
  return [...set]
}

// Per-session cache so a font is only fetched once (also holds failed attempts,
// which then silently fall back to the browser's system fonts).
const _loading = new Map<string, Promise<void>>()

// NOTE: document.fonts.check() must NOT be used here as a "font installed?"
// probe. check() answers "can this text render without waiting for a font
// load?" — a missing font falls back to system fonts and therefore still
// returns true. Only a FontFace that is actually present in document.fonts
// with status 'loaded' counts as available.
function hasLoadedFontFace(family: string): boolean {
  if (typeof document === 'undefined' || !document.fonts) return false
  for (const face of document.fonts) {
    if (face.family === family && face.status === 'loaded') return true
  }
  return false
}

function loadFontFace(family: string): Promise<void> {
  const existing = _loading.get(family)
  if (existing) return existing

  if (hasLoadedFontFace(family)) {
    const done = Promise.resolve()
    _loading.set(family, done)
    return done
  }

  const p = getServiceBase()
    .then(base => `${base}/api/fonts/face?name=${encodeURIComponent(family)}`)
    .then(url => new FontFace(family, `url(${url})`).load())
    .then(face => { document.fonts.add(face) })
    .catch(err => {
      console.warn(`[XStat] Could not load font '${family}' from service:`, err)
    })
  _loading.set(family, p)
  return p
}

/** Ensure every font used by the panel is available in this browser. */
export function ensurePanelFonts(widgets: PanelWidget[]): void {
  for (const family of collectPanelFonts(widgets)) {
    void loadFontFace(family)
  }
}
