using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using XStat.Service.Services;

namespace XStat.Service.Controllers;

[ApiController]
[Route("api/widget")]
public sealed class WidgetController : ControllerBase
{
    private readonly PanelLayoutStore _store;

    public WidgetController(PanelLayoutStore store) => _store = store;

    /// <summary>
    /// Serves a custom widget's HTML as a real HTTP page so the panel can load it
    /// via iframe src=. Opaque-origin srcdoc iframes can be left blank by Chrome
    /// field trials (content in DOM but never laid out/painted) — real URL loads
    /// are unaffected. The widget's document.baseURI is then http://…, so the
    /// common font-injection snippet (`document.baseURI.match(/^https?:\/\//)`)
    /// resolves to the service origin correctly.
    /// GET /api/widget?id={widgetId}&v={contentVersion}
    /// </summary>
    [HttpGet]
    public IActionResult Get([FromQuery] string id)
    {
        var layout = _store.GetLayoutJson();
        if (layout is null) return NotFound();

        try
        {
            using var doc = JsonDocument.Parse(layout);
            if (!doc.RootElement.TryGetProperty("widgets", out var widgets)) return NotFound();

            foreach (var w in widgets.EnumerateArray())
            {
                if (!w.TryGetProperty("id", out var idProp) || idProp.GetString() != id) continue;
                if (!w.TryGetProperty("customHtml", out var htmlProp) || string.IsNullOrEmpty(htmlProp.GetString()))
                    return NotFound();

                var html = htmlProp.GetString()!;

                // Inline ./data/{filename} references with their data URLs.
                if (w.TryGetProperty("customFiles", out var files))
                {
                    foreach (var f in files.EnumerateObject())
                        html = html.Replace($"./data/{f.Name}", f.Value.GetString(), StringComparison.Ordinal);
                }

                // Paint self-check: the iframe reports its height 400ms after load;
                // the panel rebuilds it if 0 (layout not executed → blank).
                const string check =
                    "<script>setTimeout(function(){try{var h=window.innerHeight||document.documentElement.offsetHeight||0;" +
                    "window.parent.postMessage({__xstatPaintCheck:h},'*');}catch(e){}},400);</script>";
                if (html.Contains("</head>", StringComparison.OrdinalIgnoreCase))
                    html = html.Replace("</head>", check + "</head>", StringComparison.OrdinalIgnoreCase);
                else if (html.Contains("<body", StringComparison.OrdinalIgnoreCase))
                    html = Regex.Replace(html, "<body[^>]*>", m => m.Value + check, RegexOptions.IgnoreCase);
                else
                    html = check + html;

                return Content(html, "text/html; charset=utf-8");
            }
            return NotFound();
        }
        catch (JsonException)
        {
            return NotFound();
        }
    }
}
