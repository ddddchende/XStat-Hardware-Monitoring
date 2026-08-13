using System.Diagnostics;
using System.Management;
using Microsoft.AspNetCore.Mvc;
using XStat.Service.Hardware;
using XStat.Service.Models;

namespace XStat.Service.Controllers;

/// <summary>
/// GET /api/system-info — static hardware/system info (CPU model, GPU model, RAM
/// size/speed, disk drive letters &amp; labels, OS version). Polled rarely by the
/// frontend (info doesn't change at runtime). Windows-only via WMI.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public sealed class SystemInfoController : ControllerBase
{
    private readonly ILogger<SystemInfoController> _logger;

    public SystemInfoController(ILogger<SystemInfoController> logger) => _logger = logger;

    [HttpGet]
    public ActionResult<SystemInfo> Get()
    {
        if (!OperatingSystem.IsWindows())
            return StatusCode(501, new { error = "System info is only available on Windows." });

        try
        {
            var os     = QueryOs();
            var cpu    = QueryCpuModel();
            var gpu    = QueryGpuModel();
            var ram    = QueryRam(out var ramSpeed, out var ramType);
            var disks  = QueryDisks();
            var ramTotal = ram.Sum(r => r.CapacityBytes);

            return Ok(new SystemInfo(
                OsName:        os.name,
                OsVersion:     os.version,
                CpuModel:      cpu,
                GpuModel:      gpu,
                RamTotalBytes: ramTotal,
                RamSpeedMhz:   ramSpeed,
                RamType:       ramType,
                RamSticks:     ram,
                Disks:         disks
            ));
        }
               catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to collect system info via WMI.");
            return StatusCode(500, new { error = "Failed to collect system info.", detail = ex.Message });
        }
    }

    private (string name, string version) QueryOs()
    {
        using var searcher = new ManagementObjectSearcher(
            "SELECT Caption, Version, BuildNumber FROM Win32_OperatingSystem");
        foreach (var mo in searcher.Get().Cast<ManagementObject>())
        {
            var caption     = mo["Caption"]?.ToString()?.Trim() ?? "";
            var version     = mo["Version"]?.ToString() ?? "";
            var buildNumber = mo["BuildNumber"]?.ToString() ?? "";
            // Normalize "Microsoft Windows 11 ..." → "Windows 11 ..."
            if (caption.StartsWith("Microsoft ", StringComparison.OrdinalIgnoreCase))
                caption = caption["Microsoft ".Length..];
            return (caption, $"{version} (Build {buildNumber})");
        }
        return ("Unknown", "");
    }

    private static string QueryCpuModel()
    {
        using var searcher = new ManagementObjectSearcher(
            "SELECT Name FROM Win32_Processor");
        foreach (var mo in searcher.Get().Cast<ManagementObject>())
        {
            var name = mo["Name"]?.ToString()?.Trim();
            if (!string.IsNullOrEmpty(name)) return name;
        }
        return Environment.GetEnvironmentVariable("PROCESSOR_IDENTIFIER") ?? "Unknown";
    }

    private static string QueryGpuModel()
    {
        using var searcher = new ManagementObjectSearcher(
            "SELECT Name, AdapterCompatibility FROM Win32_VideoController");
        var gpus = searcher.Get()
            .Cast<ManagementObject>()
            .Select(mo => (
                Name: mo["Name"]?.ToString()?.Trim() ?? "",
                Vendor: mo["AdapterCompatibility"]?.ToString()?.Trim() ?? ""
            ))
            .Where(g => !string.IsNullOrEmpty(g.Name))
            .ToList();

        if (gpus.Count == 0) return "";

        // Prefer real GPUs by vendor name (most reliable). Virtual display adapters
        // (Parsec, GameViewer, Microsoft Basic Render, Indirect Display) are skipped.
        string[] realVendors = { "NVIDIA", "AMD", "Advanced Micro Devices", "Intel", "Intel Corporation" };
        var real = gpus.FirstOrDefault(g =>
            realVendors.Any(v => g.Vendor.Contains(v, StringComparison.OrdinalIgnoreCase)));
        if (!string.IsNullOrEmpty(real.Name)) return real.Name;

        // Fall back: any GPU whose name doesn't look like a virtual adapter.
        string[] virtualNames = {
            "Parsec", "GameViewer", "Microsoft Basic Render", "Indirect Display",
            "Remote Desktop", "Hyper-V", "Virtual Display", "Mirage"
        };
        var nonVirtual = gpus.FirstOrDefault(g =>
            !virtualNames.Any(v => g.Name.Contains(v, StringComparison.OrdinalIgnoreCase)));
        return nonVirtual.Name != null ? nonVirtual.Name : gpus[0].Name;
    }

    private static List<RamStick> QueryRam(out uint speedMhz, out string ramType)
    {
        speedMhz = 0;
        ramType  = "";
        var sticks = new List<RamStick>();

        using var searcher = new ManagementObjectSearcher(
            "SELECT Manufacturer, Capacity, ConfiguredClockSpeed, Speed, PartNumber, SMBIOSMemoryType, DeviceLocator, FormFactor FROM Win32_PhysicalMemory");
        foreach (var mo in searcher.Get().Cast<ManagementObject>())
        {
            var manufacturer = mo["Manufacturer"]?.ToString()?.Trim() ?? "";
            var capacityStr  = mo["Capacity"]?.ToString() ?? "0";
            long.TryParse(capacityStr, out var cap);
            var configuredSpeed = Convert.ToUInt32(mo["ConfiguredClockSpeed"] ?? 0u);
            var speed           = Convert.ToUInt32(mo["Speed"] ?? 0u);
            var partNumber      = mo["PartNumber"]?.ToString()?.Trim() ?? "";
            var locator         = mo["DeviceLocator"]?.ToString()?.Trim() ?? "";
            var formFactorCode  = Convert.ToUInt32(mo["FormFactor"] ?? 0u);

            // ConfiguredClockSpeed (actual MT/s) preferred; fallback to Speed (max).
            var effectiveSpeed = configuredSpeed > 0 ? configuredSpeed : speed;
            if (effectiveSpeed > speedMhz) speedMhz = effectiveSpeed;

            // SMBIOSMemoryType: 0x1A=26=DDR4, 0x22=34=DDR5, 0x18=24=DDR3
            var smbiosType = Convert.ToUInt32(mo["SMBIOSMemoryType"] ?? 0u);
            var type = smbiosType switch
            {
                20 => "DDR",
                21 => "DDR2",
                24 => "DDR3",
                26 => "DDR4",
                34 => "DDR5",
                _  => ""
            };
            if (!string.IsNullOrEmpty(type) && string.IsNullOrEmpty(ramType)) ramType = type;

            sticks.Add(new RamStick(
                Device:         locator,
                Manufacturer:   manufacturer,
                CapacityBytes:  cap,
                SpeedMhz:       effectiveSpeed,
                PartNumber:     partNumber,
                FormFactor:     formFactorCode switch
                {
                    8  => "DIMM",
                    12 => "SODIMM",
                    _  => ""
                }
            ));
        }
        return sticks;
    }

    private static List<DiskInfo> QueryDisks()
    {
        var disks = new List<DiskInfo>();

        // Win32_DiskDrive gives model + index; Win32_LogicalDisk gives drive letters
        // (different keys). Bridge via Win32_DiskDriveToDiskPartition + Win32_LogicalDiskToPartition.
        // For simplicity & robustness, map logical disks directly — most users want drive letters.
        using var logical = new ManagementObjectSearcher(
            "SELECT DeviceID, VolumeName, Size, FreeSpace, DriveType, MediaType FROM Win32_LogicalDisk WHERE DriveType=3");
        // DriveType=3 = Local Disk (fixed). Skip network(4)/removable(2)/cd(5).

        // Map model → disk index for SSD/HDD detection via MediaType.
        foreach (var mo in logical.Get().Cast<ManagementObject>())
        {
            var driveLetter = mo["DeviceID"]?.ToString()?.Trim() ?? "";
            var label       = mo["VolumeName"]?.ToString()?.Trim() ?? "";
            long.TryParse(mo["Size"]?.ToString(), out var size);
            long.TryParse(mo["FreeSpace"]?.ToString(), out var free);
            var mediaType = mo["MediaType"]?.ToString()?.Trim() ?? "";

            // MediaType for fixed disks is typically "" on modern Windows; detect SSD/HDD
            // via rotational-chemistry is unreliable from Win32_LogicalDisk alone. Leave Type
            // empty unless clearly indicated.
            var type = mediaType.Contains("SSD", StringComparison.OrdinalIgnoreCase) ? "SSD"
                     : mediaType.Contains("HDD", StringComparison.OrdinalIgnoreCase) ? "HDD"
                     : "";

            disks.Add(new DiskInfo(
                Model:       "", // Logical disk has no "model" — pair with physical via partition map below
                DriveLetter: driveLetter,
                Label:       label,
                TotalBytes:  size,
                FreeBytes:   free,
                Type:        type
            ));
        }

        // Optionally enrich Model + SSD/HDD via Win32_DiskDrive + partition mapping.
        try { EnrichWithPhysicalDisks(disks); } catch { /* best-effort */ }

        return disks;
    }

    private static void EnrichWithPhysicalDisks(List<DiskInfo> logicalDisks)
    {
        // Build physical disk model + rotational-skip (SSD/HDD) per partition.
        // Win32_DiskDrive → partitions → logical disks.
        var physicalModels = new Dictionary<uint, (string Model, bool IsSsd)>();

        using var dd = new ManagementObjectSearcher(
            "SELECT Index, Model, Size, MediaType FROM Win32_DiskDrive");
        foreach (var mo in dd.Get().Cast<ManagementObject>())
        {
            var idx   = Convert.ToUInt32(mo["Index"] ?? 0u);
            var model = mo["Model"]?.ToString()?.Trim() ?? "";
            // MediaType "" on modern Windows; use Size & presence of rotational sensor isn't exposed.
            // Heuristic: model contains "SSD" or "NVMe" → SSD; "HDD" → HDD.
            var isSsd = model.Contains("SSD", StringComparison.OrdinalIgnoreCase)
                     || model.Contains("NVMe", StringComparison.OrdinalIgnoreCase);
            physicalModels[idx] = (model, isSsd);
        }

        // Map logical disk → partition → physical disk index.
        using var ldp = new ManagementObjectSearcher(
            "ASSOCIATORS OF {Win32_DiskDrive} WHERE ResultClass=Win32_DiskPartition");
        // Simpler: iterate partitions and their logical disk associations.
        using var parts = new ManagementObjectSearcher(
            "SELECT DiskIndex, DeviceID FROM Win32_DiskPartition");
        var partToDisk = new Dictionary<string, uint>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in parts.Get().Cast<ManagementObject>())
        {
            var dIdx   = Convert.ToUInt32(p["DiskIndex"] ?? 0u);
            var devId  = p["DeviceID"]?.ToString()?.Trim() ?? "";
            partToDisk[devId] = dIdx;
        }

        // Logical disk → partition association.
        using var ld = new ManagementObjectSearcher(
            "SELECT DeviceID FROM Win32_LogicalDisk");
        foreach (var mo in ld.Get().Cast<ManagementObject>())
        {
            var driveLetter = mo["DeviceID"]?.ToString()?.Trim() ?? "";
            // Use ASSOCIATORS to find partition for this logical disk.
            using var assoc = new ManagementObjectSearcher(
                $"ASSOCIATORS OF {{Win32_LogicalDisk.DeviceID=\"{driveLetter}\"}} WHERE ResultClass=Win32_DiskPartition");
            foreach (var part in assoc.Get().Cast<ManagementObject>())
            {
                var partId = part["DeviceID"]?.ToString()?.Trim() ?? "";
                if (!partToDisk.TryGetValue(partId, out var diskIdx)) continue;
                if (!physicalModels.TryGetValue(diskIdx, out var info)) continue;

                var entry = logicalDisks.FirstOrDefault(d =>
                    d.DriveLetter.Equals(driveLetter, StringComparison.OrdinalIgnoreCase));
                if (entry is null) continue;
                if (string.IsNullOrEmpty(entry.Model))
                {
                    var updated = entry with
                    {
                        Model = info.Model,
                        Type  = info.IsSsd ? "SSD" : (string.IsNullOrEmpty(entry.Type) ? "HDD" : entry.Type)
                    };
                    var idx = logicalDisks.IndexOf(entry);
                    if (idx >= 0) logicalDisks[idx] = updated;
                }
            }
        }
    }
}
