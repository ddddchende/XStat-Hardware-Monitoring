import React from 'react'
import { Box, Typography } from '@mui/material'
import type { PanelWidget } from '@/types/panel'
import type { HardwareSnapshot } from '@/types/sensors'

/** Convert polar angle (degrees, 0=top, clockwise) to SVG cartesian */
function polarToXY(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

/** SVG arc path from `from` to `to` degrees (clockwise) */
function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [sx, sy] = polarToXY(cx, cy, r, from)
  const [ex, ey] = polarToXY(cx, cy, r, to)
  const largeArc = to - from > 180 ? 1 : 0
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
}

interface Props {
  widget: PanelWidget
  snapshot: HardwareSnapshot | null
}

export const SensorGaugeWidget: React.FC<Props> = ({ widget, snapshot }) => {
  const sensor       = snapshot?.sensors.find(s => s.id === widget.sensorId)
  const value        = sensor?.value ?? 0
  const min          = widget.min ?? 0
  const max          = widget.max ?? 100
  const pct          = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const variant      = widget.variant ?? 'arc'
  const accentColor      = widget.accentColor      ?? widget.color ?? '#7c6ef5'
  const color            = widget.color            ?? '#7c6ef5'
  const fontSize         = widget.fontSize         ?? 16
  const labelColor       = widget.labelColor       ?? 'rgba(255,255,255,0.4)'
  const labelFontSize    = widget.labelFontSize    ?? 10
  const labelBold        = widget.labelBold        ?? false
  const labelFontFamily  = widget.labelFontFamily  ?? undefined
  const labelItalic      = widget.labelItalic      ?? false
  const valueBold        = widget.valueBold        ?? true
  const valueFontFamily  = widget.valueFontFamily  ?? undefined
  const valueItalic      = widget.valueItalic      ?? false
  const unitColor        = widget.unitColor        ?? 'rgba(255,255,255,0.4)'
  const unitFontSize     = widget.unitFontSize     ?? 8
  const unitBold         = widget.unitBold         ?? false
  const unitFontFamily   = widget.unitFontFamily   ?? undefined
  const unitItalic       = widget.unitItalic       ?? false
  const hideDecimals     = widget.hideDecimals     ?? false
  const label            = widget.label ?? sensor?.name ?? 'No sensor'
  const displayValue     = sensor?.value != null ? (hideDecimals ? value.toFixed(0) : value.toFixed(1)) : '—'
  const displayUnit      = widget.unit ?? sensor?.unit ?? ''
  const showLabel        = widget.showLabel ?? true
  const showValue        = widget.showValue ?? true
  const showUnit         = widget.showUnit  ?? true
  const showAccent       = widget.showAccent ?? true

  // Geometry per variant
  const r = 34, sw = 7
  let cx = 50, cy = 54
  let startAngle = 135, sweep = 270
  if (variant === 'full') {
    cx = 50; cy = 50
  } else if (variant === 'half') {
    cx = 50; cy = 62; startAngle = 270; sweep = 180
  }
  const valueAngle = startAngle + pct * sweep
  const circumference = 2 * Math.PI * r
  const dashOffset = circumference * (1 - pct)

  return (
    <Box
      sx={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        px: 0.5, py: 0.5,
      }}
    >
      <Box
        sx={{
          flex: 1, width: '100%', minHeight: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%' }}
        >
          {variant === 'full' ? (
            <>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
              {showAccent && pct > 0.005 && (
                <circle
                  cx={cx} cy={cy} r={r} fill="none" stroke={accentColor} strokeWidth={sw} strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={dashOffset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                />
              )}
            </>
          ) : (
            <>
              {/* Track */}
              <path
                d={arcPath(cx, cy, r, startAngle, startAngle + sweep)}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={sw}
                strokeLinecap="round"
              />
              {/* Value fill */}
              {showAccent && pct > 0.005 && (
                <path
                  d={arcPath(cx, cy, r, startAngle, valueAngle)}
                  fill="none"
                  stroke={accentColor}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  style={{ transition: 'all 0.35s ease' }}
                />
              )}
            </>
          )}
          {/* Value + unit (same line, baseline-aligned so the unit sits at the
              bottom of the value instead of being vertically centered on it) */}
          {(showValue || (showUnit && displayUnit)) && (
          <text
            x={cx} y={cy - 2 + fontSize * 0.4}
            textAnchor="middle" dominantBaseline="baseline"
          >
            {showValue && (
            <tspan
              fill={color} fontSize={fontSize}
              fontWeight={valueBold ? 'bold' : 'normal'}
              fontStyle={valueItalic ? 'italic' : 'normal'}
              fontFamily={valueFontFamily ?? 'Inter, system-ui, sans-serif'}
            >
              {displayValue}
            </tspan>
            )}
            {showUnit && displayUnit && (
            <tspan
              dx={showValue ? 4 : 0}
              fill={unitColor} fontSize={unitFontSize}
              fontWeight={unitBold ? 'bold' : 'normal'}
              fontStyle={unitItalic ? 'italic' : 'normal'}
              fontFamily={unitFontFamily ?? 'Inter, system-ui, sans-serif'}
            >
              {displayUnit}
            </tspan>
            )}
          </text>
          )}
        </svg>
      </Box>
      {showLabel && (
      <Typography
        sx={{
          fontSize: labelFontSize, color: labelColor,
          fontWeight: labelBold ? 700 : 400,
          fontStyle: labelItalic ? 'italic' : 'normal',
          fontFamily: labelFontFamily,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          pb: 0.5, userSelect: 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}
      >
        {label}
      </Typography>
      )}
    </Box>
  )
}
