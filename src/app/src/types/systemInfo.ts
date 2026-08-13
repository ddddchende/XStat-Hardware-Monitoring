// Static system info matching the .NET backend SystemInfo model.
// Fetched rarely (info doesn't change at runtime) via GET /api/systeminfo.

export interface RamStick {
  device: string
  manufacturer: string
  capacityBytes: number
  speedMhz: number
  partNumber: string
  formFactor: string
}

export interface DiskInfo {
  model: string
  driveLetter: string
  label: string
  totalBytes: number
  freeBytes: number
  type: string
}

export interface SystemInfo {
  osName: string
  osVersion: string
  cpuModel: string
  gpuModel: string
  ramTotalBytes: number
  ramSpeedMhz: number
  ramType: string
  ramSticks: RamStick[]
  disks: DiskInfo[]
  uptimeSeconds?: number
}
