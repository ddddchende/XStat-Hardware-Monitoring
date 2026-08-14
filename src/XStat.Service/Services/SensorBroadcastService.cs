using Microsoft.AspNetCore.SignalR;
using XStat.Service.Hardware;
using XStat.Service.Hubs;
using XStat.Service.Models;

namespace XStat.Service.Services;

/// <summary>
/// Background service that polls LibreHardwareMonitor on a fixed interval
/// and broadcasts the snapshot to all connected SignalR clients.
/// </summary>
public sealed class SensorBroadcastService : BackgroundService
{
    private readonly HardwareMonitor _monitor;
    private readonly IHubContext<SensorHub> _hubContext;
    private readonly ILogger<SensorBroadcastService> _logger;

    // Cached last snapshot for REST clients and the broadcaster.
    private volatile HardwareSnapshot? _lastSnapshot;
    public HardwareSnapshot? LastSnapshot => _lastSnapshot;

    // Poll interval — mutable at runtime so the Settings page can change it live.
    private volatile int _pollIntervalMs;
    public int PollIntervalMs
    {
        get => _pollIntervalMs;
        set => _pollIntervalMs = Math.Clamp(value, 100, 30_000);
    }

    public SensorBroadcastService(
        HardwareMonitor monitor,
        IHubContext<SensorHub> hubContext,
        ILogger<SensorBroadcastService> logger,
        IConfiguration config)
    {
        _monitor = monitor;
        _hubContext = hubContext;
        _logger = logger;
        _pollIntervalMs = config.GetValue<int>("SensorPollIntervalMs", 1000);
    }

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
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    _lastSnapshot = _monitor.GetSnapshot();
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "Error collecting sensor data.");
                }
                await Task.Delay(_pollIntervalMs, stoppingToken).ConfigureAwait(false);
            }
        }, stoppingToken);

        // Broadcaster: pushes the latest cached snapshot on the poll interval,
        // independent of how long a collection takes.
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var snap = _lastSnapshot;
                if (snap is not null)
                {
                    try
                    {
                        await _hubContext.Clients.All.SendAsync("SensorSnapshot", snap, stoppingToken);
                    }
                    catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                    {
                        _logger.LogWarning(ex, "Error broadcasting sensor data.");
                    }
                }
                await Task.Delay(_pollIntervalMs, stoppingToken).ConfigureAwait(false);
            }
        }
        finally
        {
            await Task.WhenAll(slowTask, collectTask).ConfigureAwait(false);
        }
    }
}
