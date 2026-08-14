import React from 'react'
import { Box, Typography } from '@mui/material'
import type { PanelWidget } from '@/types/panel'
import type { HardwareSnapshot, SensorReading } from '@/types/sensors'
import { autoThroughput, isMbpsUnit } from '@/utils/formatThroughput'

interface Props {
  widget: PanelWidget
  snapshot: HardwareSnapshot | null
}

// Debug / inspection widget: dumps every live sensor, grouped by category → hardware.
export const SensorListWidget: React.FC<Props> = ({ widget, snapshot }) => {
  const fontSize = widget.fontSize ?? 11
  const sensors = snapshot?.sensors ?? []

  // Group: category → hardwareName → sensors (keeps original sensor order).
  const cats = new Map<string, { hws: Map<string, SensorReading[]>; count: number }>()
  for (const s of sensors) {
    let cat = cats.get(s.category)
    if (!cat) {
      cat = { hws: new Map(), count: 0 }
      cats.set(s.category, cat)
    }
    cat.count++
    const list = cat.hws.get(s.hardwareName)
    if (list) list.push(s)
    else cat.hws.set(s.hardwareName, [s])
  }
  const groups = [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const nameStyle: React.CSSProperties = {
    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
    whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.78)',
  }
  const metaStyle: React.CSSProperties = { flexShrink: 0, color: 'rgba(255,255,255,0.35)' }

  return (
    <Box sx={{
      width: '100%', height: '100%', overflow: 'auto', userSelect: 'none',
      fontFamily: 'Consolas, "Cascadia Mono", "Courier New", monospace',
      fontSize, lineHeight: 1.5, color: '#e8e8ec', p: 0.75,
    }}>
      <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: fontSize + 2, lineHeight: 1.3 }}>
        All Sensors ({sensors.length})
      </Typography>

      {groups.length === 0 && (
        <Typography sx={{ color: 'rgba(255,255,255,0.35)', mt: 0.5 }}>
          Waiting for sensor data…
        </Typography>
      )}

      {groups.map(([cat, g]) => (
        <React.Fragment key={cat}>
          <Typography sx={{ color: widget.accentColor ?? '#9c8af5', fontWeight: 700, fontSize: fontSize + 1, mt: 1, lineHeight: 1.4 }}>
            {cat} ({g.count})
          </Typography>
          {[...g.hws.entries()].map(([hw, list]) => (
            <React.Fragment key={hw}>
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 0.4, lineHeight: 1.4 }}>
                {hw}
              </Typography>
              {list.map(s => {
                // Network throughput (Mbps) shows as auto-unit byte rate (KB/s…).
                const disp = isMbpsUnit(s.unit)
                  ? autoThroughput(s.value)
                  : { value: s.value != null ? s.value.toFixed(1) : '—', unit: s.unit }
                return (
                  <Box
                    key={s.id}
                    title={`${s.hardwareName} / ${s.name} / ${s.type}`}
                    sx={{ display: 'flex', gap: 1, '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}
                  >
                    <Box sx={nameStyle}>{s.name}</Box>
                    <Box sx={metaStyle}>{s.type}</Box>
                    <Box sx={{ flexShrink: 0, color: '#F07505', fontWeight: 700, textAlign: 'right' }}>
                      {disp.value}
                    </Box>
                    <Box sx={metaStyle}>{disp.unit}</Box>
                  </Box>
                )
              })}
            </React.Fragment>
          ))}
        </React.Fragment>
      ))}
    </Box>
  )
}
