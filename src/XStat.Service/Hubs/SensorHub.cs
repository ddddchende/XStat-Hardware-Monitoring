using Microsoft.AspNetCore.SignalR;
using XStat.Service.Models;
using XStat.Service.Services;

namespace XStat.Service.Hubs;

/// <summary>
/// SignalR hub. Clients subscribe and receive sensor snapshots pushed by SensorBroadcastService.
// Client JS: const conn = new signalR.HubConnectionBuilder().withUrl("/hubs/sensors").build();
//            conn.on("SensorHistory",  history => { ... });   // up to 60s, on GetHistory()
//            conn.on("SensorSnapshot", data => { ... });       // live, every poll
//
// Bandwidth optimization: by default every connection receives the full snapshot
// every poll (legacy behavior). A LAN panel can call Subscribe() with the sensors
// its widgets actually use; the service then pushes only those sensors, so a
// panel that uses 10 sensors receives ~1 KB instead of ~50 KB per poll.
/// </summary>
public sealed class SensorHub(SensorBroadcastService broadcast) : Hub
{
    private readonly SensorBroadcastService _broadcast = broadcast;

    public override Task OnConnectedAsync()
    {
        _broadcast.OnClientConnected(Context.ConnectionId);
        return base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        _broadcast.OnClientDisconnected(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Declares the sensors this connection needs. Sensors matching ANY rule are
    /// pushed; an empty/absent ruleset pushes nothing (widgets keep their static
    /// content). Call SubscribeAll() to fall back to the full snapshot.
    /// </summary>
    public Task Subscribe(SensorFilter? filter)
    {
        _broadcast.Subscribe(Context.ConnectionId, filter is null ? null : new[] { filter });
        return Task.CompletedTask;
    }

    /// <summary>Restores the default full-snapshot push for this connection.</summary>
    public Task SubscribeAll()
    {
        _broadcast.SubscribeAll(Context.ConnectionId);
        return Task.CompletedTask;
    }

    /// <summary>Returns the server-side history window (up to 60s), reduced to the
    /// sensors this connection subscribed to. Clients call this after Subscribe().</summary>
    public Task<IReadOnlyList<HardwareSnapshot>> GetHistory()
        => Task.FromResult(_broadcast.GetHistory(Context.ConnectionId));
}
