// Panel editor types — Phase 3

export type WidgetType =
  | 'SensorValue'
  | 'SensorBar'
  | 'SensorSparkline'
  | 'SensorGauge'
  | 'Clock'
  | 'Text'
  | 'Custom'
  | 'Image'
  | 'Box'
  | 'SystemInfo'
  | 'SensorList'
  | 'SvgIcon'

/** Box widget background animation presets (Uiverse.io references). */
export type BoxAnimation =
  | 'grid'      // animated diagonal grid lines
  | 'rain'      // cyan rain + blur grain
  | 'blob'      // drifting neon blur blobs
  | 'neon'      // orange/red rain + hue-rotate flicker
  | 'cyber'     // cyber grid (cyan + magenta)
  | 'matrix'    // digital rain columns
  | 'green'     // green rain
  | 'scan'      // scanline stripe pattern
  | 'cyan'      // cyan rain + scanline grain

/**
 * Text shadow style, edited per text element in the widget properties panel.
 * angle 0° = shadow offset to the right; 90° = downward; 180° = left; 270° = up.
 */
export interface TextShadowStyle {
  enabled?: boolean
  color?: string      // shadow color (default black)
  opacity?: number    // strength 0..100
  blur?: number       // blur radius px 0..40
  distance?: number   // offset length px 0..20
  angle?: number      // shadow direction degrees 0..360
}

export interface PanelWidget {
  id: string
  type: WidgetType
  widgetName?: string       // user-defined display name
  /** Widget group — widgets sharing a groupId are moved/copied/exported/imported together. */
  groupId?: string
  // Sensor binding
  sensorId?: string
  label?: string
  unit?: string
  // Visual — accent / UI element (bar fill, sparkline stroke, gauge arc)
  accentColor?: string
  // Visual — value text element
  color?: string
  fontSize?: number
  valueBold?: boolean
  valueFontFamily?: string
  valueItalic?: boolean
  hideDecimals?: boolean            // round value to integer (no decimal places)
  // Per-element label styling
  labelColor?: string
  labelFontSize?: number
  labelBold?: boolean
  labelFontFamily?: string
  labelItalic?: boolean
  // Per-element unit styling (SensorValue + SensorGauge)
  unitColor?: string
  unitFontSize?: number
  unitBold?: boolean
  unitFontFamily?: string
  unitItalic?: boolean
  // Clock / Text global font
  fontFamily?: string
  italic?: boolean
  // Text shadow (per text element, see TextStyleSection in WidgetProperties)
  textShadow?: TextShadowStyle           // generic (Text widget etc.)
  valueShadow?: TextShadowStyle
  labelShadow?: TextShadowStyle
  unitShadow?: TextShadowStyle
  timeShadow?: TextShadowStyle           // Clock time
  dateShadow?: TextShadowStyle           // Clock date
  // Range (Bar + Gauge + Sparkline)
  min?: number
  max?: number
  // SensorSparkline: true (default) = Y axis auto-scales to the data;
  // false = use the min/max values above as a fixed range.
  autoScale?: boolean
  // SensorBar progress bar thickness (px)
  barThickness?: number
  // Widget style variant:
  //   SensorBar:       flat | rounded | segmented
  //   SensorGauge:     arc  | full   | half
  //   SensorSparkline: area | line   | bars
  variant?: string
  // Clock
  clockFormat?: '12h' | '24h'
  showTime?: boolean
  showSeconds?: boolean
  showAmPm?: boolean
  timeBold?: boolean
  showDate?: boolean
  dateFormat?: 'numeric' | 'short' | 'long' | 'full' | 'day'
  dateColor?: string
  dateFontSize?: number
  dateBold?: boolean
  dateFontFamily?: string
  dateItalic?: boolean
  // Text
  text?: string
  textAlign?: 'left' | 'center' | 'right'
  fontWeight?: 'normal' | 'bold'
  // Custom HTML widget
  customHtml?: string
  // Files attached to this widget — filename → base64 data URL
  // Referenced in HTML as ./data/{filename}
  customFiles?: Record<string, string>
  // Custom widget — user-configurable props declared via __xstatConfig in the
  // HTML; edited in the properties panel and injected via postMessage.
  customProps?: Record<string, string | number | boolean>
  // Image widget
  imageDataUrl?: string
  imageObjectFit?: 'contain' | 'cover' | 'fill' | 'none'
  imageOpacity?: number
  // SVG icon widget — raw SVG markup, rendered as-is inside the widget box
  svgCode?: string
  // Box (rectangle frame) widget
  boxFill?: string          // background color
  boxBorderColor?: string   // border color
  boxBorderWidth?: number   // border thickness (px)
  boxRadius?: number        // corner radius (px)
  // Box background animation (toggleable, works as a background effect layer)
  boxAnimate?: boolean
  boxAnimation?: BoxAnimation
  boxEffectOpacity?: number      // effect layer opacity 0–100
  boxEffectColor?: string        // effect primary color (empty = effect default)
  boxEffectRandom?: boolean      // randomize effect colors (blob)
  boxEffectSpeed?: number        // animation speed multiplier (0.1–5, default 1)
  // SystemInfo widget — which fields to show + styling
  sysShowCpu?: boolean
  sysShowGpu?: boolean
  sysShowRamTotal?: boolean
  sysShowRamSpeed?: boolean
  sysShowOs?: boolean
  sysShowDisks?: boolean
  sysShowUptime?: boolean
  // SystemInfo widget — style customization
  sysShowLabels?: boolean       // show row titles (CPU/RAM/OS/…)
  sysShowIcons?: boolean        // show row icons
  sysIconColor?: string         // override icon color (falls back to accentColor)
  sysDisksToShow?: string[]    // drive letters to display (empty = all)
  sysDiskFormat?: 'model' | 'name'  // disk row: "Model | Type (Letters)" vs "H: 资源" (letter + partition name)
  sysTextAlign?: 'left' | 'center' | 'right'  // row title + value alignment
  // Layer ordering
  zIndex?: number
  // Element visibility toggles (sensor widgets)
  showLabel?: boolean
  showValue?: boolean
  showUnit?: boolean
  showAccent?: boolean
}

export interface LayoutItem {
  i: string
  x: number   // pixels from canvas left
  y: number   // pixels from canvas top
  w: number   // pixels wide
  h: number   // pixels tall
}

export interface PanelLayout {
  id: string
  name: string
  canvasWidth: number
  canvasHeight: number
  canvasBackground: string
  canvasBackgroundImage?: string | null   // data URL or http(s) URL
  canvasShowGrid: boolean
  canvasGridColor?: string          // dot grid dot color (hex), default #ffffff
  locked?: boolean                  // canvas lock — widgets can be selected but not dragged
  widgets: PanelWidget[]
  layout: LayoutItem[]
}

// Default widget dimensions in pixels
export const WIDGET_DEFAULTS: Record<WidgetType, { w: number; h: number }> = {
  SensorValue:     { w: 180, h: 80  },
  SensorBar:       { w: 300, h: 50  },
  SensorSparkline: { w: 300, h: 120 },
  SensorGauge:     { w: 140, h: 140 },
  Clock:           { w: 220, h: 80  },
  Text:            { w: 180, h: 36  },
  Custom:          { w: 240, h: 160 },
  Image:           { w: 200, h: 200 },
  Box:             { w: 337, h: 560 },
  SystemInfo:      { w: 260, h: 200 },
  SensorList:      { w: 260, h: 320 },
  SvgIcon:         { w: 80,  h: 80  },
}
