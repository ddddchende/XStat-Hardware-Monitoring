using LibreHardwareMonitor.Hardware;
using System.Diagnostics;
using System.Text.RegularExpressions;
using XStat.Service.Models;

namespace XStat.Service.Hardware;

/// <summary>
/// Wraps LibreHardwareMonitor. Must run elevated (Administrator) for full sensor access.
/// </summary>
public sealed partial class HardwareMonitor : IDisposable
{
    private readonly Computer _computer;
    private readonly ILogger<HardwareMonitor> _logger;
    private bool _disposed;

    // Slow hardware (storage SMART) is collected on a background thread by
    // SensorBroadcastService, because a single SMART query can take ~1s per disk and
    // 5 disks serially = 5.6s — far too slow for the hot path. The background collector
    // refreshes this cache; GetSnapshot() just reads it. NIC throughput is cheap to
    // read, so network adapters are collected inline in GetSnapshot() at the
    // configured poll rate instead of on this slow cadence.
    private static bool IsSlowHardware(HardwareType t) =>
        t == HardwareType.Storage;

    private readonly Lock _slowLock = new();
    private List<SensorReading> _slowReadings = [];

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

        // Fast hardware — CPU/GPU/RAM/motherboard/network. Update every call (cheap;
        // NIC throughput reads are fast). Storage is skipped here; it's refreshed by
        // UpdateSlowHardware() on a background thread and merged from the cache below.
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

        sensors = KeepPhysicalMemoryUsage(sensors);
        sensors = FixTotalPhysicalMemory(sensors);
        sensors = AddTotalNetworkThroughput(sensors);

        return new HardwareSnapshot(
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            sensors);
    }

    /// <summary>
    /// LHM can surface RAM usage twice: a commit-based entry whose Used+Available
    /// equals the commit limit (physical RAM + pagefile — far larger than real
    /// RAM) plus the real physical entry. Any consumer that takes the first match
    /// (panels, sensor pickers, custom widgets) then reads the wrong, too-low
    /// usage. Keep only the physical entry — the one with the smallest
    /// Used+Available total — and drop the Load/Used/Available/Total sensors of
    /// the other memory entries. Per-module sensors (Capacity, Timing) are never
    /// touched. Fails open (returns the input unchanged) when there aren't ≥2
    /// computable memory entries to disambiguate.
    /// </summary>
    private static List<SensorReading> KeepPhysicalMemoryUsage(List<SensorReading> sensors)
    {
        static bool IsUsage(SensorReading s) => s.Category == "RAM" && (
            s.Type == "Load"
            || (s.Type == "Data" && (s.Name.Contains("Used") || s.Name.Contains("Available") || s.Name == "Total Physical Memory")));

        var groups = sensors.Where(IsUsage).GroupBy(s => HardwareKey(s.Id)).ToList();
        if (groups.Count < 2) return sensors;

        // Total per memory entry = Used + Available.
        var totals = new Dictionary<string, float>(groups.Count);
        foreach (var g in groups)
        {
            float? used = null, avail = null;
            foreach (var s in g)
            {
                if (s.Type != "Data" || s.Value is null) continue;
                if (s.Name.Contains("Used")) used = s.Value;
                else if (s.Name.Contains("Available")) avail = s.Value;
            }
            if (used.HasValue && avail.HasValue)
                totals[g.Key] = used.Value + avail.Value;
        }
        if (totals.Count < 2) return sensors; // fail-open: can't tell the entries apart

        var physicalKey = totals.MinBy(kv => kv.Value).Key;
        return sensors.Where(s => !IsUsage(s) || HardwareKey(s.Id) == physicalKey).ToList();
    }

    /// <summary>
    /// Total Physical Memory should reflect the installed physical RAM — the sum
    /// of every module's Capacity from SPD (e.g. 64 GB). Windows reserves part of
    /// the RAM for the kernel/hardware, so the synthesized Used + Available value
    /// under-reports (e.g. 63.7 GB for 64 GB installed). When SPD capacities are
    /// unavailable (VMs, boards that can't read SPD) this falls back to the
    /// Used + Available value synthesized in CollectHardware.
    /// </summary>
    private static List<SensorReading> FixTotalPhysicalMemory(List<SensorReading> sensors)
    {
        float? totalCapacity = null;
        foreach (var s in sensors)
        {
            if (s.Category == "RAM" && s.Type == "Data"
                && s.Name.Contains("Capacity", StringComparison.OrdinalIgnoreCase) && s.Value is not null)
                totalCapacity = (totalCapacity ?? 0f) + s.Value.Value;
        }

        if (totalCapacity is null) return sensors;

        return sensors.Select(s =>
            s.Category == "RAM" && s.Type == "Data" && s.Name == "Total Physical Memory"
                ? s with { Value = (float)Math.Round(totalCapacity.Value, 1) }
                : s
        ).ToList();
    }

    /// <summary>Sensor id minus the trailing "/type/index" → identifies the owning hardware entry.</summary>
    private static string HardwareKey(string id)
    {
        var i = id.LastIndexOf('/');
        if (i > 0) i = id.LastIndexOf('/', i - 1);
        return i > 0 ? id[..i] : id;
    }

    /// <summary>
    /// Synthesizes combined network throughput: sums every NIC's upload / download
    /// throughput into a single pair of sensors ("Total Upload Speed" /
    /// "Total Download Speed", hardware "Network Total") so the UI — panels, the
    /// sensor picker and custom widgets — can show the aggregate traffic of all
    /// adapters at once. The pair is always emitted (a direction that can't be
    /// identified, or no NIC at all, simply totals to 0) so the sensors are
    /// guaranteed to show up in the sensor picker.
    /// </summary>
    private static List<SensorReading> AddTotalNetworkThroughput(List<SensorReading> sensors)
    {
        float totalUl = 0f, totalDl = 0f;
        foreach (var s in sensors)
        {
            if (s.Category != "Network" || s.Type != "Throughput" || s.Value is null) continue;
            if (s.Name.Contains("upload", StringComparison.OrdinalIgnoreCase)) totalUl += s.Value.Value;
            else if (s.Name.Contains("download", StringComparison.OrdinalIgnoreCase)) totalDl += s.Value.Value;
        }

        var result = new List<SensorReading>(sensors);
        result.Add(new SensorReading(
            Id: "network/total/upload_speed",
            Name: "Total Upload Speed",
            Category: "Network",
            Type: "Throughput",
            Value: (float)Math.Round(totalUl, 2),
            Unit: "Mbps",
            HardwareName: "Network Total"
        ));
        result.Add(new SensorReading(
            Id: "network/total/download_speed",
            Name: "Total Download Speed",
            Category: "Network",
            Type: "Throughput",
            Value: (float)Math.Round(totalDl, 2),
            Unit: "Mbps",
            HardwareName: "Network Total"
        ));
        return result;
    }

    /// <summary>
    /// Collects slow hardware (storage SMART) into the cache.
    /// Meant to be called on a background thread by SensorBroadcastService, since
    /// SMART queries can take ~1s per disk and block the hot path otherwise.
    /// Network adapters are intentionally NOT here — they're read inline in
    /// GetSnapshot() at the configured poll rate.
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
        VirtualAdapterRegex().IsMatch(name) ||
        // Windows kernel debugger pseudo-adapter
        name.Contains("Kernel Debugger", StringComparison.OrdinalIgnoreCase) ||
        // Virtual hotspot / mobile broadband adapters
        VirtualHotspotRegex().IsMatch(name);

    [GeneratedRegex(@"-.+-\d{4}$")]
    private static partial Regex VirtualAdapterRegex();

    [GeneratedRegex(@"^Local Area Connection\*")]
    private static partial Regex VirtualHotspotRegex();

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
        // can show physical total memory as a selectable sensor under RAM. This is a
        // fallback — FixTotalPhysicalMemory() later overrides the value with the sum of
        // all module Capacities (SPD) when available, which includes Windows-reserved RAM.
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
