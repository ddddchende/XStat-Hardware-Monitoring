// Network throughput auto-unit formatting.
// The service reports Throughput sensors in Mbps (megabits per second). For
// display, convert to human-friendly byte rates with an auto-selected unit:
//   1 MB/s = 8 Mbps, 1 KB/s = 0.008 Mbps, 1 GB/s = 8000 Mbps.

export interface ThroughputDisplay {
  value: string
  unit: string
}

/** Convert a Mbps value into an auto-unit byte-rate string pair. */
export function autoThroughput(mbps: number | null | undefined, hideDecimals = false): ThroughputDisplay {
  if (mbps == null) return { value: '—', unit: '' }
  if (mbps === 0) return { value: '0', unit: 'MB/s' }
  const abs = Math.abs(mbps)
  if (abs < 0.008) return { value: (mbps * 125000).toFixed(0), unit: 'B/s' }
  if (abs < 8)     return { value: (mbps * 125).toFixed(hideDecimals ? 0 : 1), unit: 'KB/s' }
  if (abs < 8000)  return { value: (mbps / 8).toFixed(hideDecimals ? 0 : 1), unit: 'MB/s' }
  return { value: (mbps / 8000).toFixed(hideDecimals ? 0 : 2), unit: 'GB/s' }
}

/** True when a sensor's unit is the Mbps throughput unit. */
export function isMbpsUnit(unit: string | undefined | null): boolean {
  return (unit ?? '').trim().toLowerCase() === 'mbps'
}
