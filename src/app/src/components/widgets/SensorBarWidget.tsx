import React from 'react'
import { Box, Typography } from '@mui/material'
import type { PanelWidget } from '@/types/panel'
import type { HardwareSnapshot } from '@/types/sensors'

interface Props {
  widget: PanelWidget
  snapshot: HardwareSnapshot | null
}

export const SensorBarWidget: React.FC<Props> = ({ widget, snapshot }) => {
  const sensor       = snapshot?.sensors.find(s => s.id === widget.sensorId)
  const value        = sensor?.value ?? 0
  const min          = widget.min ?? 0
  const max          = widget.max ?? 100
  const pct          = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const variant      = widget.variant ?? 'flat'
  const accentColor      = widget.accentColor      ?? widget.color ?? '#7c6ef5'
  const color            = widget.color            ?? '#7c6ef5'
  const fontSize         = widget.fontSize         ?? 11
  const labelColor       = widget.labelColor       ?? 'rgba(255,255,255,0.6)'
  const labelFontSize    = widget.labelFontSize    ?? 11
  const labelBold        = widget.labelBold        ?? false
  const labelFontFamily  = widget.labelFontFamily  ?? undefined
  const labelItalic      = widget.labelItalic      ?? false
  const valueBold        = widget.valueBold        ?? true
  const valueFontFamily  = widget.valueFontFamily  ?? undefined
  const valueItalic      = widget.valueItalic      ?? false
  const label            = widget.label ?? sensor?.name ?? 'No sensor'
  const displayValue = sensor?.value != null
    ? `${value.toFixed(1)} ${widget.unit ?? sensor?.unit ?? ''}`.trim()
    : '—'
  const showLabel = widget.showLabel ?? true
  const showValue = widget.showValue ?? true
  const showAccent = widget.showAccent ?? true

  // Variant-specific default thickness
  const defaultThickness = variant === 'rounded' ? 14 : variant === 'segmented' ? 10 : 6
  const barThickness = widget.barThickness ?? defaultThickness

  const renderBar = () => {
    if (variant === 'segmented') {
      const segments = 10
      const lit = Math.round(pct * segments)
      return (
        <Box sx={{ display: 'flex', gap: '2px', height: barThickness, width: '100%' }}>
          {Array.from({ length: segments }).map((_, i) => (
            <Box
              key={i}
              sx={{
                flex: 1,
                borderRadius: 1,
                background: i < lit && showAccent ? accentColor : 'rgba(255,255,255,0.08)',
                transition: 'background 0.35s ease',
              }}
            />
          ))}
        </Box>
      )
    }

    const isRounded = variant === 'rounded'
    return (
      <Box
        sx={{
          height: barThickness,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        {showAccent && (
          <Box
            sx={{
              height: '100%', width: `${pct * 100}%`,
              background: accentColor,
              borderRadius: isRounded ? 999 : 3,
              transition: 'width 0.35s ease',
            }}
          />
        )}
      </Box>
    )
  }

  return (
    <Box
      sx={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', px: 1.5, py: 0.75, gap: 0.5,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
        {showLabel && (
        <Typography
          sx={{
            fontSize: labelFontSize, color: labelColor,
            fontWeight: labelBold ? 700 : 400,
            fontStyle: labelItalic ? 'italic' : 'normal',
            fontFamily: labelFontFamily,
            userSelect: 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}
        >
          {label}
        </Typography>
        )}
        {showValue && (
        <Typography
          sx={{
            fontSize, color, fontWeight: valueBold ? 700 : 400,
            fontStyle: valueItalic ? 'italic' : 'normal',
            fontFamily: valueFontFamily,
            userSelect: 'none', flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayValue}
        </Typography>
        )}
      </Box>
      {renderBar()}
    </Box>
  )
}
