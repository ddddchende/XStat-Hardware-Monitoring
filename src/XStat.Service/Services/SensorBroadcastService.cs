using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using XStat.Service.Hardware;
using XStat.Service.Hubs;
using XStat.Service.Models;

namespace XStat.Service.Services;

/// <summary>
/// Background service that polls LibreHardwareMonitor on a fixed interval
/// and broadcasts the snapshot to all connected SignalR clients.
/// </summary>
public sealed class SensorBroadcastService(
    HardwareMonitor monitor,
    IHubContext<SensorHub> hubContext,
    ILogger<SensorBroadcastService> logger,
    IConfiguration config) : BackgroundService
{
    private readonly HardwareMonitor _monitor = monitor;
    private readonly IHubContext<SensorHub> _hubContext = hubContext;
    private readonly ILogger<SensorBroadcastService> _logger = logger;

    // Cached last snapshot for REST clients and the broadcaster.
    private volatile HardwareSnapshot? _lastSnapshot;
    public HardwareSnapshot? LastSnapshot => _lastSnapshot;
    private readonly SemaphoreSlim _snapshotReady = new(0, 1);

    // Server-side history window: kept so a newly connected client (e.g. a phone
    // opening the LAN panel) receives the recent snapshots and can render charts
    // immediately instead of starting from an empty buffer.
    private const int HistoryWindowMs = 60_000;
    private const int HistoryMaxSnapshots = 600; // bounds payload at very fast polls
    private readonly Lock _historyLock = new();
    private readonly List<HardwareSnapshot> _history = []; // oldest → newest

    /// <summary>Returns the snapshots kept within the last 60s (oldest first), reduced to the
    /// sensors a connection subscribed to (full history when unsubscribed).</summary>
    public IReadOnlyList<HardwareSnapshot> GetHistory(string? connectionId = null)
    {
        lock (_historyLock)
        {
            var filters = connectionId is not null && _subscriptions.TryGetValue(connectionId, out var f) ? f : null;
            if (filters is null) return _history.ToArray();
            return _history.Select(h => FilterSnapshot(h, filters)).ToArray();
        }
    }

    private void AppendHistory(HardwareSnapshot snap)
    {
        lock (_historyLock)
        {
            _history.Add(snap);
            var cutoff = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - HistoryWindowMs;
            _history.RemoveAll(h => h.TimestampMs < cutoff);
            if (_history.Count > HistoryMaxSnapshots)
                _history.RemoveRange(0, _history.Count - HistoryMaxSnapshots);
        }
    }

    // Poll interval — mutable at runtime so the Settings page can change it live.
    private volatile int _pollIntervalMs = config.GetValue<int>("SensorPollIntervalMs", 1000);
    public int PollIntervalMs
    {
        get => _pollIntervalMs;
        set => _pollIntervalMs = Math.Clamp(value, 100, 30_000);
    }

    // Per-connection sensor subscription. Value null = client never subscribed
    // (or called SubscribeAll) → receive the full snapshot. A non-null list is
    // the client-declared SensorFilter[]; the snapshot is reduced to matching
    // sensors before it is pushed to that connection. Connections are tracked
    // here (not by IHubContext, which can't enumerate them) via the Hub's
    // OnConnected/OnDisconnected callbacks.
    private readonly ConcurrentDictionary<string, List<SensorFilter>?> _subscriptions = new();

    public void OnClientConnected(string connectionId) => _subscriptions.TryAdd(connectionId, null);

    public void OnClientDisconnected(string connectionId) => _subscriptions.TryRemove(connectionId, out _);

    public void Subscribe(string connectionId, IReadOnlyList<SensorFilter>? filters)
        => _subscriptions[connectionId] = filters is { Count: > 0 } ? filters.ToList() : [];

    public void SubscribeAll(string connectionId) => _subscriptions[connectionId] = null;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("SensorBroadcastService started. Poll interval: {Interval}ms",
            _pollIntervalMs);

        // Slow collector: refreshes the storage sensor cache on a background
        // thread. A single SMART query can take ~1s per disk (5 disks = 5.6s), so
        // this runs on its own 5s cadence and never blocks the hot path.
        // Network adapters are not here — they're read inline in GetSnapshot() at
        // the configured poll rate.
        var slowTask = Task.Run(async () =>
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    _monitor.UpdateSlowHardware();
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "Error collecting slow hardware data.");
                }
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken).ConfigureAwait(false);
            }
        }, stoppingToken);

        // Fast collector: refreshes CPU/GPU/RAM/motherboard/network on the poll
        // interval. GetSnapshot() merges the slow-hardware (storage) cache
        // populated above, so it stays cheap regardless of how many disks are present.
        var collectTask = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(_pollIntervalMs));
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    _lastSnapshot = _monitor.GetSnapshot();
                    if (_lastSnapshot is not null) AppendHistory(_lastSnapshot);
                    if (_snapshotReady.CurrentCount == 0) _snapshotReady.Release();
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "Error collecting sensor data.");
                }
                await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false);
            }
        }, stoppingToken);

        // Broadcaster: pushes the latest cached snapshot on the poll interval,
        // independent of how long a collection takes. Clients that subscribed
        // (via the Hub's Subscribe method) receive only their sensors; the rest
        // keep getting the full snapshot (legacy behavior).
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await _snapshotReady.WaitAsync(stoppingToken).ConfigureAwait(false);
                var snap = _lastSnapshot;
                if (snap is not null)
                {
                    try
                    {
                        // Unsubscribed connections (value null) → full snapshot in one batch.
                        var fullIds = _subscriptions.Where(kv => kv.Value is null).Select(kv => kv.Key).ToList();
                        if (fullIds.Count > 0)
                            await _hubContext.Clients.Clients(fullIds).SendAsync("SensorSnapshot", snap, stoppingToken);

                        // Subscribed connections → only the sensors they asked for.
                        foreach (var (cid, filters) in _subscriptions)
                        {
                            if (filters is null) continue;
                            var filtered = FilterSnapshot(snap, filters);
                            await _hubContext.Clients.Client(cid).SendAsync("SensorSnapshot", filtered, stoppingToken);
                        }
                    }
                    catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                    {
                        _logger.LogWarning(ex, "Error broadcasting sensor data.");
                    }
                }
            }
        }
        finally
        {
            await Task.WhenAll(slowTask, collectTask).ConfigureAwait(false);
        }
    }

    /// <summary>Reduces a snapshot to the sensors matching any of the given filters.</summary>
    private static HardwareSnapshot FilterSnapshot(HardwareSnapshot snap, IReadOnlyList<SensorFilter> filters)
    {
        if (filters.Count == 0) return snap with { Sensors = Array.Empty<SensorReading>() };
        var list = new List<SensorReading>(Math.Min(snap.Sensors.Count, 16));
        foreach (var s in snap.Sensors)
            foreach (var f in filters)
                if (Matches(s, f)) { list.Add(s); break; }
        return snap with { Sensors = list };
    }

    private static bool Matches(SensorReading s, SensorFilter f)
    {
        if (f.SensorIds is { Length: > 0 })
        {
            foreach (var id in f.SensorIds)
                if (s.Id == id || s.Id.Contains(id, StringComparison.OrdinalIgnoreCase) || s.Name == id)
                    return true;
        }
        if (f.Conditions is { Length: > 0 })
        {
            foreach (var cond in f.Conditions)
            {
                var ok = true;
                foreach (var (key, want) in cond)
                {
                    var got = FieldOf(s, key);
                    if (got is null || !got.Contains(want, StringComparison.OrdinalIgnoreCase)) { ok = false; break; }
                }
                if (ok) return true;
            }
        }
        return false;
    }

    private static string? FieldOf(SensorReading s, string key) => key.ToLowerInvariant() switch
    {
        "id" => s.Id,
        "name" => s.Name,
        "category" => s.Category,
        "type" => s.Type,
        "unit" => s.Unit,
        "hardwarename" => s.HardwareName,
        _ => null,
    };
}
