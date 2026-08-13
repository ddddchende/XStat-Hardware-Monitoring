namespace XStat.Service.Models;

/// <summary>
/// Static hardware/system info that doesn't change at runtime (CPU model, RAM
/// size/speed, disk drive letters, OS version). Exposed via GET /api/system-info
/// so the frontend can show labels like "i7-12700K", "32GB", "Windows 11 23H2".
/// </summary>
public record SystemInfo(
    string OsName,           // "Windows 11 Pro"
    string OsVersion,        // "23H2 (Build 22631.4317)"
    string CpuModel,         // "12th Gen Intel Core i7-12700K"
    string GpuModel,         // "NVIDIA GeForce RTX 3080"
    long   RamTotalBytes,    // total physical RAM in bytes
    uint   RamSpeedMhz,      // memory clock speed (MT/s), 0 if unknown
    string RamType,          // "DDR4" / "DDR5" / ""
    IReadOnlyList<RamStick> RamSticks,
    IReadOnlyList<DiskInfo>  Disks
);

public record RamStick(
    string Device,           //Locator/Slot: "DIMM0" etc.
    string Manufacturer,
    long   CapacityBytes,
    uint   SpeedMhz,
    string PartNumber,
    string FormFactor        // "SODIMM" / "DIMM" / ""
);

public record DiskInfo(
    string Model,            // "Samsung SSD 980 PRO 500GB"
    string DriveLetter,      // "C:" (may be empty for unmounted)
    string Label,            // "本地磁盘" / "System"
    long   TotalBytes,
    long   FreeBytes,
    string Type              // "SSD" / "HDD" / ""
);
