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
    /// GET /api/widget?panelId={panelId}&id={widgetId}&v={contentVersion}
    /// </summary>
    [HttpGet]
    public IActionResult Get([FromQuery] string id, [FromQuery] string? panelId = null)
    {
        var layout = _store.GetLayoutJson();
        if (layout is null) return NotFound();

        try
        {
            using var doc = JsonDocument.Parse(layout);
            var root = doc.RootElement;

            // The layout can be a workspace ({panels:[…]} with widgets nested per
            // panel) or a legacy single panel (root-level widgets). Search every
            // panel — the requested widget may live in any of them.
            IActionResult? TryServe(JsonElement widgetsArr)
            {
                foreach (var w in widgetsArr.EnumerateArray())
                {
                    if (!w.TryGetProperty("id", out var idProp) || idProp.GetString() != id) continue;
                    if (!w.TryGetProperty("customHtml", out var htmlProp) || string.IsNullOrEmpty(htmlProp.GetString()))
                        continue;

                    var html = htmlProp.GetString()!;

                    // Inline ./data/{filename} references with their data URLs.
                    if (w.TryGetProperty("customFiles", out var files))
                    {
                        foreach (var f in files.EnumerateObject())
                            html = html.Replace($"./data/{f.Name}", f.Value.GetString(), StringComparison.Ordinal);
                    }

                    // Font bridge: the parent page ships fonts as data URLs via
                    // postMessage; this script rewrites @font-face src to the data
                    // URL so the iframe never performs a cross-origin font request.
                    // (Fixes custom-widget fonts failing on mobile WebViews over
                    // HTTPS even with correct CORS headers.)
                    const string fontBridge =
                        "<script>(function(){"
                        + "var fontMap={},patched={},registered={};"
                        + "window.addEventListener('message',function(e){"
                        +   "if(e.data&&e.data.__xstatFonts){"
                        +     "var m=e.data.__xstatFonts;"
                        +     "for(var k in m){if(m.hasOwnProperty(k))fontMap[k]=m[k];}"
                        +     "patch();registerFaces();"
                        +     "var n=0;var t=setInterval(function(){patch();registerFaces();if(++n>=8)clearInterval(t);},120);"
                        +   "}"
                        + "},false);"
                        + "function patch(){"
                        +   "try{"
                        +     "for(var i=0;i<document.styleSheets.length;i++){"
                        +       "var rules=document.styleSheets[i].cssRules;"
                        +       "if(!rules)continue;"
                        +       "for(var j=0;j<rules.length;j++){"
                        +         "var r=rules[j];"
                        +         "if(r.type===CSSRule.FONT_FACE_RULE&&r.style&&fontMap[r.style.fontFamily]&&!patched[r.style.fontFamily]){"
                        +           "patched[r.style.fontFamily]=1;"
                        +           "r.style.setProperty('src',\"url('\"+fontMap[r.style.fontFamily]+\"')\",'important');"
                        +         "}"
                        +       "}"
                        +     "}"
                        +   "}catch(e){}"
                        + "}"
                        + "function registerFaces(){"
                        +   "setTimeout(function(){"
                        +     "try{"
                        +       "for(var k in fontMap){"
                        +         "if(fontMap.hasOwnProperty(k)&&!registered[k]){"
                        +           "registered[k]=1;"
                        +           "(function(fam,u){"
                        +             "var ff=new FontFace(fam,'url('+u+')');"
                        +             "ff.load().then(function(f){try{document.fonts.add(f);}catch(e){}}).catch(function(){});"
                        +           "})(k,fontMap[k]);"
                        +         "}"
                        +       "}"
                        +     "}catch(e){}"
                        +   "},200);"
                        + "}"
                        + "})();</script>";

                    // Paint self-check: the iframe reports its height 400ms after load;
                    // the panel rebuilds it if 0 (layout not executed → blank).
                    const string check =
                        "<script>setTimeout(function(){try{var h=window.innerHeight||document.documentElement.offsetHeight||0;" +
                        "window.parent.postMessage({__xstatPaintCheck:h},'*');}catch(e){}},400);</script>";

                    // Tap bridge: clicks inside the sandboxed iframe do not bubble
                    // to the parent document, so the panel's triple-tap switcher
                    // would never trigger over a full-screen custom widget. This
                    // capture-phase listener reports every tap upward.
                    const string tapBridge =
                        "<script>(function(){document.addEventListener('click',function(){try{window.parent.postMessage({__xstatTap:1},'*');}catch(e){}},true);})();</script>";

                    string injected = tapBridge + fontBridge + check;
                    if (html.Contains("</head>", StringComparison.OrdinalIgnoreCase))
                        html = html.Replace("</head>", injected + "</head>", StringComparison.OrdinalIgnoreCase);
                    else if (html.Contains("<body", StringComparison.OrdinalIgnoreCase))
                        html = Regex.Replace(html, "<body[^>]*>", m => m.Value + injected, RegexOptions.IgnoreCase);
                    else
                        html = injected + html;

                    return Content(html, "text/html; charset=utf-8");
                }
                return null;
            }

            if (root.TryGetProperty("panels", out var panels))
            {
                foreach (var p in panels.EnumerateArray())
                {
                    if (panelId is not null && (!p.TryGetProperty("id", out var panelIdProp) || panelIdProp.GetString() != panelId))
                        continue;
                    if (!p.TryGetProperty("widgets", out var ws) || ws.ValueKind != JsonValueKind.Array) continue;
                    var served = TryServe(ws);
                    if (served != null) return served;
                }
            }
            if (panelId is null && root.TryGetProperty("widgets", out var wsRoot) && wsRoot.ValueKind == JsonValueKind.Array)
            {
                var served = TryServe(wsRoot);
                if (served != null) return served;
            }
            return NotFound();
        }
        catch (JsonException)
        {
            return NotFound();
        }
    }
}
