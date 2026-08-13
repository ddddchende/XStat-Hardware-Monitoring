import React, { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import MemoryIcon from '@mui/icons-material/Memory'
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent'
import StorageIcon from '@mui/icons-material/Storage'
import DnsIcon from '@mui/icons-material/Dns'
import InfoIcon from '@mui/icons-material/Info'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import type { PanelWidget } from '@/types/panel'
import { useSystemInfo } from '@/hooks/useSystemInfo'

interface Props {
  widget: PanelWidget
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 GB'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)} TB`
  return `${gb.toFixed(0)} GB`
}

// "2d 15:44:58" when ≥ 1 day, otherwise "15:44:58".
function formatUptime(totalSeconds: number): string {
  const s   = Math.max(0, Math.floor(totalSeconds))
  const d   = Math.floor(s / 86400)
  const h   = Math.floor((s % 86400) / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const hhmmss = `${pad(h)}:${pad(m)}:${pad(sec)}`
  return d > 0 ? `${d}d ${hhmmss}` : hhmmss
}

/**
 * Static system info widget — CPU/GPU model, RAM size/speed, OS version, disk list.
 * Data is fetched once from /api/systeminfo (shared cache across widgets).
 * Item visibility is controlled by widget properties.
 */
export const SystemInfoWidget: React.FC<Props> = ({ widget }) => {
  const { info, loading, error } = useSystemInfo()

  const showCpu      = widget.sysShowCpu      ?? true
  const showGpu      = widget.sysShowGpu      ?? true
  const showRamTotal = widget.sysShowRamTotal ?? true
  const showRamSpeed = widget.sysShowRamSpeed ?? true
  const showOs       = widget.sysShowOs       ?? true
  const showDisks   = widget.sysShowDisks    ?? true
  const showUptime  = widget.sysShowUptime   ?? true
  const showLabels  = widget.sysShowLabels   ?? true
  const showIcons   = widget.sysShowIcons    ?? true
  const iconColor   = widget.sysIconColor    ?? widget.accentColor ?? '#03dac6'
  const disksToShow = widget.sysDisksToShow ?? []
  const align       = widget.sysTextAlign   ?? 'left'

  // Uptime comes from the backend as a base value; tick it locally every second
  // so it stays live without re-polling the (rarely-refreshed) /api/systeminfo.
  const [uptime, setUptime] = useState<number>(info?.uptimeSeconds ?? 0)
  useEffect(() => {
    if (typeof info?.uptimeSeconds !== 'number') return
    setUptime(info.uptimeSeconds)
    const id = setInterval(() => setUptime(u => u + 1), 1000)
    return () => clearInterval(id)
  }, [info?.uptimeSeconds])

  // Base text style (mirrors SensorValueWidget — respects per-element styling).
  const labelStyle: React.CSSProperties = {
    color: widget.labelColor ?? 'rgba(255,255,255,0.55)',
    fontSize: (widget.labelFontSize ?? 12),
    fontWeight: widget.labelBold ? 'bold' : 'normal',
    fontFamily: widget.labelFontFamily ?? 'inherit',
    fontStyle: widget.labelItalic ? 'italic' : 'normal',
  }
  const valueStyle: React.CSSProperties = {
    color: widget.color ?? '#fff',
    fontSize: widget.fontSize ?? 14,
    fontWeight: widget.valueBold ? 'bold' : 'normal',
    fontFamily: widget.valueFontFamily ?? 'inherit',
    fontStyle: widget.valueItalic ? 'italic' : 'normal',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  }

  if (loading) {
    return (
      <Box sx={{ width: '100%', height: '100%', p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ ...labelStyle }}>Loading…</Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ width: '100%', height: '100%', p: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ ...valueStyle, color: 'error.main', fontSize: 12 }}>{error}</Typography>
      </Box>
    )
  }

  if (!info) return null

  const rows: { icon: React.ReactNode; label: string; value: string }[] = []

  if (showCpu && info.cpuModel) {
    rows.push({ icon: <MemoryIcon sx={{ fontSize: 14, color: iconColor }} />, label: 'CPU', value: info.cpuModel })
  }
  if (showGpu && info.gpuModel) {
    rows.push({ icon: <SettingsInputComponentIcon sx={{ fontSize: 14, color: iconColor }} />, label: 'GPU', value: info.gpuModel })
  }
  if (showRamTotal && info.ramTotalBytes) {
    rows.push({
      icon: <DnsIcon sx={{ fontSize: 14, color: iconColor }} />,
      label: 'RAM',
      value: `${formatBytes(info.ramTotalBytes)}${showRamSpeed && info.ramSpeedMhz ? ` @ ${info.ramSpeedMhz} MHz${info.ramType ? ` ${info.ramType}` : ''}` : ''}`,
    })
  } else if (showRamSpeed && info.ramSpeedMhz) {
    rows.push({
      icon: <DnsIcon sx={{ fontSize: 14, color: iconColor }} />,
      label: 'RAM Speed',
      value: `${info.ramSpeedMhz} MHz${info.ramType ? ` ${info.ramType}` : ''}`,
    })
  }
  if (showOs && info.osName) {
    rows.push({ icon: <InfoIcon sx={{ fontSize: 14, color: iconColor }} />, label: 'OS', value: `${info.osName} (${info.osVersion})` })
  }
  if (showUptime && typeof info.uptimeSeconds === 'number') {
    rows.push({ icon: <AccessTimeIcon sx={{ fontSize: 14, color: iconColor }} />, label: 'Uptime', value: formatUptime(uptime) })
  }
  if (showDisks && info.disks.length > 0) {
    for (const d of info.disks) {
      if (!d.driveLetter) continue
      // When sysDisksToShow is configured (non-empty), only render the selected drives.
      if (disksToShow.length > 0 && !disksToShow.includes(d.driveLetter)) continue
      const label = `${d.driveLetter} ${d.label || ''}`.trim()
      const model = d.model ? ` ${d.model}` : ''
      const type  = d.type  ? ` [${d.type}]`  : ''
      rows.push({
        icon: <StorageIcon sx={{ fontSize: 14, color: iconColor }} />,
        label,
        value: `${formatBytes(d.totalBytes)}${model}${type}`.trim(),
      })
    }
  }

  // When neither icons nor labels are shown, no header row is rendered; the value
  // shouldn't carry the 2.5-unit left padding reserved for the icon+label column.
  const headerVisible = showIcons || showLabels
  // Left-aligned rows indent the value to align under the title text (past the
  // icon). Centered / right-aligned rows drop the indent so the value lines up
  // with the title block instead.
  const indentValue = headerVisible && align === 'left'
  const headerJustify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      {rows.map((row, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.25,
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            pb: 0.5,
          }}
        >
          {headerVisible && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: headerJustify }}>
              {showIcons && row.icon}
              {showLabels && <Typography component="span" sx={{ ...labelStyle }}>{row.label}</Typography>}
            </Box>
          )}
          <Typography component="div" sx={{ ...valueStyle, pl: indentValue ? 2.5 : 0, textAlign: align }}>{row.value}</Typography>
        </Box>
      ))}
    </Box>
  )
}
