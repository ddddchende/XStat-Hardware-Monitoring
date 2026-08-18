import React, { useRef, useState, useEffect } from 'react'
import { Box, Typography } from '@mui/material'
import { AreaChart, Area, BarChart, Bar, YAxis } from 'recharts'
import type { PanelWidget } from '@/types/panel'
import type { HardwareSnapshot } from '@/types/sensors'
import type { HistoryPoint } from '@/hooks/useSensorHistory'
import { textShadowCss } from '@/utils/textShadow'

interface Props {
  widget: PanelWidget
  snapshot: HardwareSnapshot | null
  history: Map<string, HistoryPoint[]>
}

export const SensorSparklineWidget: React.FC<Props> = ({ widget, snapshot, history }) => {
  const sensor       = snapshot?.sensors.find(s => s.id === widget.sensorId)
  const data         = (widget.sensorId ? history.get(widget.sensorId) : null) ?? []
  const variant      = widget.variant ?? 'area'
  const accentColor      = widget.accentColor      ?? widget.color ?? '#03dac6'
  const color            = widget.color            ?? '#03dac6'
  const fontSize         = widget.fontSize         ?? 11
  const labelColor       = widget.labelColor       ?? 'rgba(255,255,255,0.45)'
  const labelFontSize    = widget.labelFontSize    ?? 11
  const labelBold        = widget.labelBold        ?? false
  const labelFontFamily  = widget.labelFontFamily  ?? undefined
  const labelItalic      = widget.labelItalic      ?? false
  const valueBold        = widget.valueBold        ?? true
  const valueFontFamily  = widget.valueFontFamily  ?? undefined
  const valueItalic      = widget.valueItalic      ?? false
  const label            = widget.label ?? sensor?.name ?? 'No sensor'
  const currentValue = sensor?.value != null
    ? `${sensor.value.toFixed(widget.hideDecimals ? 0 : 1)} ${widget.unit ?? sensor?.unit ?? ''}`.trim()
    : '—'
  const showLabel = widget.showLabel ?? true
  const showValue = widget.showValue ?? true
  const showAccent = widget.showAccent ?? true
  const effectiveAccent = showAccent ? accentColor : 'transparent'
  const labelShadow = textShadowCss(widget.labelShadow)
  const valueShadow = textShadowCss(widget.valueShadow)
  // Auto-scale: Y axis follows the data. Turn it off to fix the range with min/max.
  const autoScale = widget.autoScale ?? true
  const rangeDomain: [number, number] = [widget.min ?? 0, widget.max ?? 100]

  // Measure the chart container ourselves so we never pass -1 to AreaChart.
  // Start with a sane default so the chart always renders immediately (even if
  // ResizeObserver hasn't reported the real size yet) — otherwise the panel can
  // show an empty box on first paint despite having data.
  const chartBoxRef = useRef<HTMLDivElement>(null)
  const [chartSize, setChartSize] = useState<{ w: number; h: number }>({ w: 200, h: 60 })

  useEffect(() => {
    const el = chartBoxRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) setChartSize({ w: Math.floor(w), h: Math.floor(h) })
    }
    measure()
    const raf = requestAnimationFrame(measure) // catch post-layout size
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const chartMargin = { top: 2, right: 0, left: 0, bottom: 0 }

  return (
    <Box
      sx={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        px: 1, pt: 0.75, pb: 0.5,
      }}
    >
      <Box
        sx={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', px: 0.5, mb: 0.5,
        }}
      >
        {showLabel && (
        <Typography
          sx={{
            fontSize: labelFontSize, color: labelColor,
            fontWeight: labelBold ? 700 : 400,
            fontStyle: labelItalic ? 'italic' : 'normal',
            fontFamily: labelFontFamily,
            userSelect: 'none', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            textShadow: labelShadow,
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
            userSelect: 'none', ml: 1, flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
            textShadow: valueShadow,
          }}
        >
          {currentValue}
        </Typography>
        )}
      </Box>
      <Box ref={chartBoxRef} sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {chartSize && (
          variant === 'bars' ? (
            <BarChart width={chartSize.w} height={chartSize.h} data={data} margin={chartMargin}>
              {!autoScale && <YAxis hide domain={rangeDomain} />}
              <Bar dataKey="v" fill={effectiveAccent} isAnimationActive={false} />
            </BarChart>
          ) : (
            <AreaChart width={chartSize.w} height={chartSize.h} data={data} margin={chartMargin}>
              {!autoScale && <YAxis hide domain={rangeDomain} />}
              <defs>
                <linearGradient id={`wsg-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={effectiveAccent} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={effectiveAccent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={effectiveAccent}
                strokeWidth={1.5}
                fill={variant === 'line' ? 'transparent' : `url(#wsg-${widget.id})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          )
        )}
      </Box>
    </Box>
  )
}
