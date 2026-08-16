import type { TextShadowStyle } from '@/types/panel'

/** Parse #rgb / #rrggbb / rgba(r,g,b,a) / rgb(r,g,b) → [r, g, b, a]. */
export function parseColor(c: string): [number, number, number, number] | null {
  const s = (c || '').trim()
  if (s.startsWith('#')) {
    let hex = s.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(h => h + h).join('')
    if (hex.length !== 6 && hex.length !== 8) return null
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    return [r, g, b, a]
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] != null ? Number(m[4]) : 1]
  return null
}

/**
 * Compose the CSS text-shadow string for a widget's TextShadowStyle.
 * angle 0° = right, 90° = down, 180° = left, 270° = up.
 * Returns undefined when disabled → omit the property entirely.
 */
export function textShadowCss(s?: TextShadowStyle): string | undefined {
  if (!s || !s.enabled) return undefined
  const color = s.color && s.color.trim() ? s.color : '#000000'
  const opacity = Math.min(100, Math.max(0, s.opacity ?? 100)) / 100
  const blur = Math.max(0, s.blur ?? 8)
  const distance = Math.max(0, s.distance ?? 4)
  const rad = ((s.angle ?? 45) * Math.PI) / 180
  const x = Math.cos(rad) * distance
  const y = Math.sin(rad) * distance
  const p = parseColor(color)
  const rgba = p
    ? `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${(p[3] * opacity).toFixed(3)})`
    : `rgba(0, 0, 0, ${opacity})`
  return `${x.toFixed(1)}px ${y.toFixed(1)}px ${blur}px ${rgba}`
}
