import React from 'react'
import { Box, Typography, Card, CardContent, useTheme } from '@mui/material'
import { useTranslation } from 'react-i18next'
import RamIcon from '@mui/icons-material/DeveloperBoard'
import { GaugeBar, Sparkline, StatTile } from '@/components/Primitives'
import { findSensor } from '@/hooks/useSensorHistory'
import type { SensorReading } from '@/types/sensors'
import type { HistoryPoint } from '@/hooks/useSensorHistory'

interface RAMPanelProps {
  sensors: SensorReading[]
  history: Map<string, HistoryPoint[]>
}

export const RAMPanel: React.FC<RAMPanelProps> = ({ sensors, history }) => {
  const theme = useTheme()
  const { t } = useTranslation()
  const ramSensors = sensors.filter(s => s.category === 'RAM')
  if (ramSensors.length === 0) return null

  // LHM can surface RAM usage twice: a commit-based entry (Used+Available ≈ commit
  // limit, far larger than physical RAM) plus the physical entry. First-match lookup
  // hits the commit-based one and shows a too-low usage, so pick the physical entry
  // (the one with the smallest Used+Available total).
  const mem = findPhysicalRAM(ramSensors)
  const memLoad  = mem.load
  const memUsed  = mem.used
  const memAvail = mem.available

  const loadHistory = memLoad ? (history.get(memLoad.id) ?? []) : []
  const accent = '#9c8af5' // soft purple for RAM

  return (
    <Card>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ color: accent, display: 'flex' }}><RamIcon /></Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('hardware.memory')}</Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <StatTile label={t('hardware.usage')}      value={memLoad?.value ?? null} unit="%" color={accent} />
          <StatTile label={t('hardware.used')}       value={memUsed?.value ?? null} unit={memUsed?.unit ?? 'GB'} color={accent} />
          <StatTile label={t('hardware.available')}  value={memAvail?.value ?? null} unit={memAvail?.unit ?? 'GB'} color={theme.palette.success.main} />
        </Box>

        {memLoad && (
          <GaugeBar label={t('hardware.memoryUsage')} value={memLoad.value} unit="%" color={accent} height={7} />
        )}

        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {t('hardware.usage60s')}
          </Typography>
          <Sparkline data={loadHistory} color={accent} height={44} unit="%" />
        </Box>
      </CardContent>
    </Card>
  )
}

/** Sensor id minus the trailing "/type/index" → identifies the owning hardware entry. */
function hardwareKey(id: string): string {
  const i = id.lastIndexOf('/')
  const j = i > 0 ? id.lastIndexOf('/', i - 1) : -1
  return j > 0 ? id.slice(0, j) : id
}

/**
 * Picks the physical-RAM sensors. LHM can expose RAM usage twice: a commit-based
 * entry whose Used+Available ≈ commit limit (far larger than physical RAM) plus the
 * physical entry; first-match lookup can land on the bogus one. Physical RAM is the
 * entry with the smallest Used+Available total. Falls back to first-match lookup
 * when there aren't ≥2 entries to disambiguate.
 */
function findPhysicalRAM(ram: SensorReading[]) {
  const usedCandidates = ram.filter(s =>
    s.type === 'Data' && (s.name === 'Used Memory' || s.name === 'Memory Used') && s.value != null)

  if (usedCandidates.length >= 2) {
    let best: { used: SensorReading; available: SensorReading } | null = null
    for (const used of usedCandidates) {
      const available = ram.find(a =>
        a.type === 'Data'
        && (a.name === 'Available Memory' || a.name === 'Memory Available')
        && a.value != null
        && hardwareKey(a.id) === hardwareKey(used.id))
      if (!available) continue
      if (!best || used.value! + available.value! < best.used.value! + best.available.value!) {
        best = { used, available }
      }
    }
    if (best) {
      const key = hardwareKey(best.used.id)
      return {
        load: ram.find(s => s.type === 'Load' && s.name === 'Memory' && hardwareKey(s.id) === key),
        used: best.used,
        available: best.available,
      }
    }
  }

  // Single entry (or entries can't be told apart) → first-match, as before.
  return {
    load: findSensor(ram, 'RAM', 'Load', 'Memory'),
    used: findSensor(ram, 'RAM', 'Data', 'Used Memory') ?? findSensor(ram, 'RAM', 'Data', 'Memory Used'),
    available: findSensor(ram, 'RAM', 'Data', 'Available Memory') ?? findSensor(ram, 'RAM', 'Data', 'Memory Available'),
  }
}
