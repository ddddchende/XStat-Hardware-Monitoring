using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using XStat.Service.Hubs;
using XStat.Service.Services;

namespace XStat.Service.Controllers;

[ApiController]
[Route("api/panel-layout")]
public sealed class PanelLayoutController : ControllerBase
{
    private readonly PanelLayoutStore   _store;
    private readonly IHubContext<SensorHub> _hub;

    public PanelLayoutController(PanelLayoutStore store, IHubContext<SensorHub> hub)
    {
        _store = store;
        _hub   = hub;
    }

    /// <summary>
    /// GET /api/panel-layout — returns the whole workspace ({panels, activePanelId}),
    /// or 204 when nothing has been pushed yet. Legacy single-panel payloads are
    /// wrapped into a workspace shape so clients can always rely on the same format.
    /// </summary>
    [HttpGet]
    public IActionResult Get()
    {
        var json = _store.GetLayoutJson();
        if (json is null) return NoContent();
        return Content(NormalizeWorkspace(json), "application/json");
    }

    /// <summary>
    /// GET /api/panel-layout/{panelId} — returns a single panel's layout, or 404
    /// when the id is unknown. Lets the LAN panel switch between panels without
    /// re-pushing anything from the editor.
    /// </summary>
    [HttpGet("{panelId}")]
    public IActionResult GetPanel(string panelId)
    {
        var json = _store.GetLayoutJson();
        if (json is null) return NoContent();
        try
        {
            using var doc = JsonDocument.Parse(NormalizeWorkspace(json));
            if (!doc.RootElement.TryGetProperty("panels", out var panels)) return NotFound();
            foreach (var p in panels.EnumerateArray())
            {
                if (p.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString() == panelId)
                    return Content(p.GetRawText(), "application/json");
            }
            return NotFound();
        }
        catch { return NotFound(); }
    }

    /// <summary>
    /// PUT /api/panel-layout — stores the workspace (or a legacy single panel)
    /// and pushes a LayoutUpdated event to all connected SignalR clients so the
    /// LAN panel refreshes immediately.
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> Put([FromBody] JsonElement body)
    {
        var json = body.GetRawText();
        _store.SetLayoutJson(json);
        await _hub.Clients.All.SendAsync("LayoutUpdated", NormalizeWorkspace(json));
        return NoContent();
    }

    /// <summary>Wrap a legacy single-panel payload into a workspace shape; workspace payloads pass through unchanged.</summary>
    private static string NormalizeWorkspace(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("panels", out _)) return json;
            var id = doc.RootElement.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
                ? idEl.GetString()
                : "default";
            return JsonSerializer.Serialize(new
            {
                panels = new[] { doc.RootElement.Clone() },
                activePanelId = id,
            });
        }
        catch { return json; }
    }
}
