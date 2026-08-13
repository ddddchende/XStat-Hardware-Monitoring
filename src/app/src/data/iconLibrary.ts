// Built-in SVG icon library for the panel editor.
// Icons are stroked white (24x24, Lucide-style) so they're visible on dark
// canvases. Selecting one creates an ImageWidget with the SVG as a data URL;
// users can then tweak opacity / size just like any uploaded image.

export interface IconDef {
  id: string
  name: string
  category: string      // category key (see ICON_CATEGORIES)
  svg: string           // complete <svg>...</svg> markup
}

const stroke = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

const fill = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff">${inner}</svg>`

export const ICON_CATEGORIES: { key: string; labelKey: string }[] = [
  { key: 'hardware', labelKey: 'iconCategory.hardware' },
  { key: 'status',   labelKey: 'iconCategory.status' },
  { key: 'arrows',   labelKey: 'iconCategory.arrows' },
  { key: 'shapes',   labelKey: 'iconCategory.shapes' },
  { key: 'general',  labelKey: 'iconCategory.general' },
  { key: 'symbols',  labelKey: 'iconCategory.symbols' },
]

export const ICONS: IconDef[] = [
  // ── Hardware ──
  { id: 'cpu',         name: 'CPU',         category: 'hardware', svg: stroke('<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>') },
  { id: 'gpu',         name: 'GPU',         category: 'hardware', svg: stroke('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>') },
  { id: 'ram',         name: 'RAM',         category: 'hardware', svg: stroke('<path d="M2 8h20v8H2z"/><path d="M6 16v2M10 16v2M14 16v2M18 16v2"/><path d="M6 8v4M10 8v4M14 8v4M18 8v4"/>') },
  { id: 'storage',     name: 'Storage',     category: 'hardware', svg: stroke('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>') },
  { id: 'network',     name: 'Network',     category: 'hardware', svg: stroke('<path d="M5 12.55a11 11 0 0 1 14 0M8.5 16.1a6 6 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0"/><circle cx="12" cy="20" r="1"/>') },
  { id: 'thermometer', name: 'Thermometer', category: 'hardware', svg: stroke('<path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/>') },

  // ── Status ──
  { id: 'bolt',        name: 'Power',     category: 'status', svg: fill('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>') },
  { id: 'battery',     name: 'Battery',   category: 'status', svg: stroke('<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><rect x="4" y="9" width="9" height="6" fill="#ffffff" stroke="none"/>') },
  { id: 'activity',    name: 'Activity',  category: 'status', svg: stroke('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>') },
  { id: 'gauge',       name: 'Gauge',     category: 'status', svg: stroke('<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>') },

  // ── Arrows ──
  { id: 'arrow-up',    name: 'Arrow Up',    category: 'arrows', svg: stroke('<path d="M12 19V5M5 12l7-7 7 7"/>') },
  { id: 'arrow-down',  name: 'Arrow Down',  category: 'arrows', svg: stroke('<path d="M12 5v14M19 12l-7 7-7-7"/>') },
  { id: 'arrow-left',  name: 'Arrow Left',  category: 'arrows', svg: stroke('<path d="M19 12H5M12 19l-7-7 7-7"/>') },
  { id: 'arrow-right', name: 'Arrow Right', category: 'arrows', svg: stroke('<path d="M5 12h14M12 5l7 7-7 7"/>') },

  // ── Shapes ──
  { id: 'circle',   name: 'Circle',   category: 'shapes', svg: stroke('<circle cx="12" cy="12" r="9"/>') },
  { id: 'square',   name: 'Square',   category: 'shapes', svg: stroke('<rect x="4" y="4" width="16" height="16" rx="1"/>') },
  { id: 'triangle', name: 'Triangle', category: 'shapes', svg: stroke('<path d="M12 3l9 16H3z"/>') },
  { id: 'star',     name: 'Star',     category: 'shapes', svg: stroke('<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>') },

  // ── General ──
  { id: 'clock',    name: 'Clock',    category: 'general', svg: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>') },
  { id: 'settings', name: 'Settings', category: 'general', svg: stroke('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>') },
  { id: 'user',     name: 'User',     category: 'general', svg: stroke('<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>') },
  { id: 'home',     name: 'Home',     category: 'general', svg: stroke('<path d="M3 11l9-8 9 8M5 10v10h14V10"/>') },

  // ── Symbols ──
  { id: 'warning', name: 'Warning', category: 'symbols', svg: stroke('<path d="M12 3l10 18H2z"/><path d="M12 9v5M12 17h.01"/>') },
  { id: 'info',    name: 'Info',    category: 'symbols', svg: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>') },
  { id: 'check',   name: 'Check',   category: 'symbols', svg: stroke('<path d="M20 6L9 17l-5-5"/>') },
  { id: 'x',       name: 'Close',   category: 'symbols', svg: stroke('<path d="M18 6L6 18M6 6l12 12"/>') },
]

/** Encode an icon's SVG as a base64 data URL suitable for ImageWidget.imageDataUrl */
export function iconToDataUrl(icon: IconDef): string {
  // btoa needs a binary-safe string; our SVGs are ASCII-only.
  return `data:image/svg+xml;base64,${btoa(icon.svg)}`
}
