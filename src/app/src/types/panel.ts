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

export interface PanelWidget {
  id: string
  type: WidgetType
  widgetName?: string       // user-defined display name
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
  // Range (Bar + Gauge)
  min?: number
  max?: number
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
  // Image widget
  imageDataUrl?: string
  imageObjectFit?: 'contain' | 'cover' | 'fill' | 'none'
  imageOpacity?: number
  // Box (rectangle frame) widget
  boxFill?: string          // background color
  boxBorderColor?: string   // border color
  boxBorderWidth?: number   // border thickness (px)
  boxRadius?: number        // corner radius (px)
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
}
