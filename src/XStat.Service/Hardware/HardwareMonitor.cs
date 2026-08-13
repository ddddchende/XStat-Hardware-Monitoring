using LibreHardwareMonitor.Hardware;
using System.Diagnostics;
using XStat.Service.Models;

namespace XStat.Service.Hardware;

/// <summary>
/// Wraps LibreHardwareMonitor. Must run elevated (Administrator) for full sensor access.
/// </summary>
public sealed class HardwareMonitor : IDisposable
{
    private readonly Computer _computer;
    private readonly ILogger<HardwareMonitor> _logger;
    private bool _disposed;

    // Slow hardware (storage SMART + NICs) is collected on a background thread by
    // SensorBroadcastService, because a single SMART query can take ~1s per disk and
    // 5 disks serially = 5.6s — far too slow for the hot path. The background collector
    // refreshes this cache; GetSnapshot() just reads it.
    private static bool IsSlowHardware(HardwareType t) =>
        t == HardwareType.Storage || t == HardwareType.Network;

    private readonly object _slowLock = new();
    private List<SensorReading> _slowReadings = new();

    // Diagnostics: per-hardware Update() timings (ms). Fast hardware from the last
    // GetSnapshot(); slow hardware from the last background collection.
    public IReadOnlyList<(string Name, string Type, double Ms)> LastUpdateTimings { get; private set; }
        = Array.Empty<(string, string, double)>();
    public IReadOnlyList<(string Name, string Type, double Ms)> LastSlowTimings { get; private set; }
        = Array.Empty<(string, string, double)>();

    public HardwareMonitor(ILogger<HardwareMonitor> logger)
    {
        _logger = logger;
        _computer = new Computer
        {
            IsCpuEnabled            = true,
            IsGpuEnabled            = true,
            IsMemoryEnabled         = true,
            IsMotherboardEnabled    = true,
            IsStorageEnabled        = true,
            IsNetworkEnabled        = true,
            IsBatteryEnabled        = true,
            IsControllerEnabled     = true,
            IsPsuEnabled            = true,
        };

        // Log elevation status - LHM uses PawnIO (signed, HVCI-compatible) on 0.9.6+.
        if (OperatingSystem.IsWindows())
        {
            bool isAdmin = new System.Security.Principal.WindowsPrincipal(
                System.Security.Principal.WindowsIdentity.GetCurrent())
                .IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);

            if (!isAdmin)
                _logger.LogWarning("[XStat] NOT running as Administrator - CPU temperature/clock/power will read 0. Launch via dev-admin.ps1.");
            else
                _logger.LogInformation("[XStat] Running as Administrator.");
        }

        try
        {
            _computer.Open();
            _logger.LogInformation("LibreHardwareMonitor opened successfully.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to open LibreHardwareMonitor. Some sensors may be unavailable.");
        }
    }

    /// <summary>
    /// Polls all hardware sensors and returns a fresh snapshot.
    /// </summary>
    public HardwareSnapshot GetSnapshot()
    {
        var raw = new List<SensorReading>();

        // Fast hardware only — CPU/GPU/RAM/motherboard. Update every call (cheap).
        // Storage/NIC are skipped here; they're refreshed by UpdateSlowHardware() on
        // a background thread and merged from the cache below.
        var sw = Stopwatch.StartNew();
        var timings = new List<(string, string, double)>();
        foreach (var hw in _computer.Hardware)
        {
            if (IsSlowHardware(hw.HardwareType)) continue;
            sw.Restart();
            CollectHardware(hw, raw, doUpdate: true);
            sw.Stop();
            timings.Add((hw.Name, hw.HardwareType.ToString(), Math.Round(sw.Elapsed.TotalMilliseconds, 1)));
        }
        LastUpdateTimings = timings;

        // Merge cached slow-hardware readings (refreshed by the background collector).
        List<SensorReading> slow;
        lock (_slowLock) { slow = _slowReadings; }
        raw.AddRange(slow);

        // Deduplicate: LHM can surface the same sensor via both parent and subhardware
        var seen    = new HashSet<string>(raw.Count);
        var sensors = new List<SensorReading>(raw.Count);
        foreach (var s in raw)
            if (seen.Add(s.Id)) sensors.Add(s);

        return new HardwareSnapshot(
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sensors);
    }

    /// <summary>
    /// Collects slow hardware (storage SMART + network adapters) into the cache.
    /// Meant to be called on a background thread by SensorBroadcastService, since
    /// SMART queries can take ~1s per disk and block the hot path otherwise.
    /// </summary>
    public void UpdateSlowHardware()
    {
        var slow = new List<SensorReading>();
        var sw = Stopwatch.StartNew();
        var timings = new List<(string, string, double)>();
        foreach (var hw in _computer.Hardware)
        {
            if (!IsSlowHardware(hw.HardwareType)) continue;
            sw.Restart();
            CollectHardware(hw, slow, doUpdate: true);
            sw.Stop();
            timings.Add((hw.Name, hw.HardwareType.ToString(), Math.Round(sw.Elapsed.TotalMilliseconds, 1)));
        }
        lock (_slowLock)
        {
            _slowReadings = slow;
            LastSlowTimings = timings;
        }
    }

    /// <summary>
    /// Returns true for virtual / filter-driver network adapters that should be hidden.
    /// LHM exposes every NDIS filter layer as a separate adapter; e.g.:
    ///   "Ethernet-WFP Native MAC Layer LightWeight Filter-0000"
    ///   "Ethernet 2-QoS Packet Scheduler-0000"
    ///   "Local Area Connection* 1"  (virtual hotspot/mobile adapters)
    /// We keep only the real physical or logical NICs.
    /// </summary>
    private static bool IsVirtualNetworkAdapter(string name) =>
        // Filter drivers: end with hyphen-word(s)-four-digits  e.g. "-QoS Packet Scheduler-0000"
        System.Text.RegularExpressions.Regex.IsMatch(name, @"-.+-\d{4}$") ||
        // Windows kernel debugger pseudo-adapter
        name.Contains("Kernel Debugger", StringComparison.OrdinalIgnoreCase) ||
        // Virtual hotspot / mobile broadband adapters
        System.Text.RegularExpressions.Regex.IsMatch(name, @"^Local Area Connection\*");

    private static void CollectHardware(IHardware hw, List<SensorReading> sensors, bool doUpdate)
    {
        // Skip noise: virtual/filter-layer network adapters
        if (hw.HardwareType == HardwareType.Network && IsVirtualNetworkAdapter(hw.Name))
            return;

        if (doUpdate) hw.Update();

        foreach (var subHw in hw.SubHardware)
        {
            CollectHardware(subHw, sensors, doUpdate);
        }

        float? memUsed = null, memAvail = null;

        foreach (var sensor in hw.Sensors)
        {
            // Sanitize: LHM returns NaN/Infinity for unavailable sensors; map those to null.
            float? safeValue = sensor.Value is null || float.IsNaN(sensor.Value.Value) || float.IsInfinity(sensor.Value.Value)
                ? null
                : sensor.Value;

            // LHM Throughput sensors emit raw bytes/second.
            // Multiply by 8 and divide by 1,000,000 (i.e. divide by 125,000) to get Mbps.
            float? displayValue = sensor.SensorType == SensorType.Throughput && safeValue.HasValue
                ? safeValue.Value / 125_000f
                : safeValue;

            sensors.Add(new SensorReading(
                Id:           BuildId(hw, sensor),
                Name:         sensor.Name,
                Category:     MapHardwareType(hw.HardwareType),
                Type:         sensor.SensorType.ToString(),
                Value:        displayValue,
                Unit:         MapUnit(sensor.SensorType),
                HardwareName: hw.Name
            ));

            // Track RAM Used/Available so we can synthesize Total Physical Memory below.
            if (hw.HardwareType == HardwareType.Memory && sensor.SensorType == SensorType.Data)
            {
                if (sensor.Name.Contains("Used", StringComparison.OrdinalIgnoreCase)) memUsed = safeValue;
                else if (sensor.Name.Contains("Available", StringComparison.OrdinalIgnoreCase)) memAvail = safeValue;
            }
        }

        // LHM's RAM hardware only exposes Used + Available; synthesize Total so the UI
        // can show physical total memory as a selectable sensor under RAM.
        if (hw.HardwareType == HardwareType.Memory && memUsed.HasValue && memAvail.HasValue)
        {
            sensors.Add(new SensorReading(
                Id:           $"{hw.HardwareType}/{hw.Identifier}/data/total"
                                  .ToLowerInvariant().Replace(" ", "_"),
                Name:         "Total Physical Memory",
                Category:     MapHardwareType(hw.HardwareType),
                Type:         "Data",
                Value:        (float)Math.Round(memUsed.Value + memAvail.Value, 1),
                Unit:         "GB",
                HardwareName: hw.Name
            ));
        }
    }

    private static string BuildId(IHardware hw, ISensor sensor) =>
        $"{hw.HardwareType}/{hw.Identifier}/{sensor.SensorType}/{sensor.Index}"
            .ToLowerInvariant()
            .Replace(" ", "_");

    private static string MapHardwareType(HardwareType type) => type switch
    {
        HardwareType.Cpu            => "CPU",
        HardwareType.GpuNvidia      => "GPU",
        HardwareType.GpuAmd         => "GPU",
        HardwareType.GpuIntel       => "GPU",
        HardwareType.Memory         => "RAM",
        HardwareType.Motherboard    => "Motherboard",
        HardwareType.SuperIO        => "Motherboard",
        HardwareType.Storage        => "Storage",
        HardwareType.Network        => "Network",
        HardwareType.Battery        => "Battery",
        HardwareType.Psu            => "PSU",
        HardwareType.EmbeddedController => "EC",
        _                           => "Other",
    };

    private static string MapUnit(SensorType type) => type switch
    {
        SensorType.Temperature  => "°C",
        SensorType.Clock        => "MHz",
        SensorType.Load         => "%",
        SensorType.Voltage      => "V",
        SensorType.Power        => "W",
        SensorType.Fan          => "RPM",
        SensorType.Flow         => "L/h",
        SensorType.Control      => "%",
        SensorType.Level        => "%",
        SensorType.Factor       => "×",
        SensorType.Data         => "GB",
        SensorType.SmallData    => "MB",
        SensorType.Throughput   => "Mbps",
        SensorType.TimeSpan     => "s",
        SensorType.Energy       => "mWh",
        SensorType.Noise        => "dBA",
        SensorType.Humidity     => "%",
        _                       => "",
    };

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { _computer.Close(); } catch { /* best effort */ }
    }
}
