import React, { useEffect, useState } from 'react'
import { Box, Typography } from '@mui/material'
import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon'
import MemoryIcon from '@mui/icons-material/Memory'
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent'
import DnsIcon from '@mui/icons-material/Dns'
import InfoIcon from '@mui/icons-material/Info'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import type { PanelWidget } from '@/types/panel'
import type { DiskInfo } from '@/types/systemInfo'
import { useSystemInfo } from '@/hooks/useSystemInfo'
import { textShadowCss } from '@/utils/textShadow'

interface Props {
  widget: PanelWidget
}

/** Hard-drive glyph (this MUI version ships no HardDrive icon). */
function HardDriveIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path
        fillRule="evenodd"
        d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H6zm6 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8 7h2v2H8V7z"
      />
    </SvgIcon>
  )
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
  const diskFormat  = widget.sysDiskFormat  ?? 'model'
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
    textShadow: textShadowCss(widget.labelShadow),
  }
  const valueStyle: React.CSSProperties = {
    color: widget.color ?? '#fff',
    fontSize: widget.fontSize ?? 14,
    fontWeight: widget.valueBold ? 'bold' : 'normal',
    fontFamily: widget.valueFontFamily ?? 'inherit',
    fontStyle: widget.valueItalic ? 'italic' : 'normal',
    lineHeight: 1.4,
    wordBreak: 'break-word',
    textShadow: textShadowCss(widget.valueShadow),
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
    // Group partitions by physical disk (same model), then render one row per
    // disk as "Model | Type (Letter) (Letter)" — no partition names or sizes.
    const filtered = info.disks.filter(d => {
      if (!d.driveLetter) return false
      if (disksToShow.length > 0 && !disksToShow.includes(d.driveLetter)) return false
      return true
    })
    const groups = new Map<string, DiskInfo[]>()
    for (const d of filtered) {
      const key = d.model || d.driveLetter
      const arr = groups.get(key) ?? []
      arr.push(d)
      groups.set(key, arr)
    }
    for (const disks of groups.values()) {
      const first = disks[0]
      if (diskFormat === 'name') {
        // "D: 资源" — first partition's letter (already includes ":") + name only
        // Empty volume name falls back to Windows' default "本地磁盘" (Local Disk).
        rows.push({
          icon: <HardDriveIcon sx={{ fontSize: 14, color: iconColor }} />,
          label: 'Disk',
          value: `${first.driveLetter}${first.label ? ` ${first.label}` : ' 本地磁盘'}`,
        })
        continue
      }
      // "Model | Type (D:) (E:)" — model summary with all partitions
      const letters = disks.map(d => d.driveLetter).sort().map(l => `(${l})`).join(' ')
      const type    = first.type ? `${first.type} ` : ''
      rows.push({
        icon: <HardDriveIcon sx={{ fontSize: 14, color: iconColor }} />,
        label: 'Disk',
        value: `${first.model} | ${type}${letters}`.trim(),
      })
    }
  }

  // Icon + title + value share one line; alignment controls the whole row.
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
            alignItems: 'center',
            gap: 0.75,
            justifyContent: headerJustify,
            borderBottom: i < rows.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            pb: 0.5,
          }}
        >
          {showIcons && row.icon}
          {showLabels && <Typography component="span" sx={{ ...labelStyle, flexShrink: 0 }}>{row.label}</Typography>}
          <Typography component="div" sx={{ ...valueStyle, flex: 1, minWidth: 0, textAlign: align }}>{row.value}</Typography>
        </Box>
      ))}
    </Box>
  )
}
