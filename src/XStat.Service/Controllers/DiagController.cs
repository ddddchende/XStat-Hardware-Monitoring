using Microsoft.AspNetCore.Mvc;
using XStat.Service.Hardware;
using XStat.Service.Services;

namespace XStat.Service.Controllers;

/// <summary>
/// Diagnostic endpoint: per-hardware Update() timings so we can pinpoint which
/// hardware is slowing collection. GET /api/diag
/// </summary>
[ApiController]
[Route("api/[controller]")]
public sealed class DiagController : ControllerBase
{
    private readonly HardwareMonitor _monitor;
    private readonly SensorBroadcastService _broadcast;

    public DiagController(HardwareMonitor monitor, SensorBroadcastService broadcast)
    {
        _monitor = monitor;
        _broadcast = broadcast;
    }

    [HttpGet]
    public IActionResult Get()
    {
        var fast = _monitor.LastUpdateTimings
            .OrderByDescending(t => t.Ms)
            .Select(t => new { name = t.Name, type = t.Type, ms = t.Ms })
            .ToList();
        var slow = _monitor.LastSlowTimings
            .OrderByDescending(t => t.Ms)
            .Select(t => new { name = t.Name, type = t.Type, ms = t.Ms })
            .ToList();

        return Ok(new
        {
            pollIntervalMs = _broadcast.PollIntervalMs,
            fastTotalMs = Math.Round(fast.Sum(t => t.ms), 1),
            slowTotalMs = Math.Round(slow.Sum(t => t.ms), 1),
            slowCadenceSec = 5,
            fastHardware = fast,
            slowHardware = slow,
        });
    }
}
