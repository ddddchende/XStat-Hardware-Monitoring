using Microsoft.AspNetCore.Mvc;
using Microsoft.Win32;

namespace XStat.Service.Controllers;

/// <summary>
/// Serves font files that are installed on this machine to *remote* panel
/// browsers. A widget on the LAN panel can reference any font the desktop user
/// picked in the editor (e.g. a custom Chinese font); the browser won't have
/// that font, so the renderer loads it from here via @font-face.
///
/// Font file location is resolved from the Windows font registry
/// (HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts), which maps a
/// family name ("宋体", "Microsoft YaHei", ...) to a file in C:\Windows\Fonts.
///
///   GET /api/fonts/face?name=宋体      → the font file bytes (ttf/otf/woff2)
///   GET /api/fonts/available           → names of fonts that can be served
///
/// Only single-file formats (.ttf/.otf/.woff/.woff2) are served — .ttc
/// collections (simsun.ttc, msyh.ttc) aren't supported by browsers' @font-face.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public sealed class FontsController : ControllerBase
{
    private static readonly Lazy<IReadOnlyDictionary<string, string>> FontMap = new(BuildFontMap);

    [HttpGet("face")]
    [HttpHead("face")]
    public IActionResult Face([FromQuery] string name)
    {
        // Fonts are public files with no credentials, so allow ANY origin. The
        // global CORS policy only whitelists null/localhost/private IPs, which
        // breaks @font-face in custom widgets when the panel is exposed through
        // a reverse proxy (the browser sends the proxy domain as Origin, which
        // is rejected → font silently falls back to the system font). Setting
        // "*" here overrides the CORS middleware's header for this endpoint —
        // the middleware's Allow-Credentials:true must also be removed, since
        // browsers forbid combining it with a wildcard origin.
        Response.Headers.AccessControlAllowOrigin = "*";
        Response.Headers.Remove("Access-Control-Allow-Credentials");
        // CORS responses must vary on Origin, otherwise caches (browser or
        // reverse proxy) may serve a pre-CORS response to a different origin.
        Response.Headers.Vary = "Origin";

        if (string.IsNullOrWhiteSpace(name)) return BadRequest(new { error = "name is required." });

        var family = name.Trim();
        if (!FontMap.Value.TryGetValue(family, out var path))
            return NotFound(new { error = $"Font '{family}' is not available for transfer." });

        var contentType = Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".otf"   => "font/otf",
            ".woff"  => "font/woff",
            ".woff2" => "font/woff2",
            _        => "font/ttf",
        };

        // Browsers cache webfonts aggressively; the file never changes.
        Response.Headers.CacheControl = "public, max-age=86400";
        return PhysicalFile(path, contentType, enableRangeProcessing: true);
    }

    [HttpGet("available")]
    public ActionResult<IReadOnlyList<string>> Available() =>
        FontMap.Value.Keys.OrderBy(k => k, StringComparer.CurrentCultureIgnoreCase).ToList();

    private static Dictionary<string, string> BuildFontMap()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!OperatingSystem.IsWindows()) return map;

        try
        {
            var fontsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Fonts");
            // Per-user fonts (installed without admin) live here and are only
            // registered under HKCU — e.g. "方正粗雅宋长简体" is
            // C:\Users\<user>\AppData\Local\Microsoft\Windows\Fonts\...
            var userFontsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Microsoft", "Windows", "Fonts");

            // Enumerate BOTH the machine font registry (HKLM) and the
            // per-user font registry (HKCU) so fonts like 方正粗雅宋长简体 that
            // were installed without admin rights can still be transferred.
            foreach (var (root, baseDir) in new[]
            {
                (Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"), fontsDir),
                (Registry.CurrentUser.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"), userFontsDir),
            })
            {
                if (root is null) continue;
                try
                {
                    foreach (var regName in root.GetValueNames())
                    {
                        var value = root.GetValue(regName)?.ToString();
                        if (string.IsNullOrEmpty(value)) continue;
                        if (!IsServedExtension(value)) continue; // skip .ttc / .fon / .ttf-packed

                        // HKCU values usually store an absolute path; both hives
                        // may also store a bare filename relative to the fonts dir.
                        var fullPath = ResolveFontPath(value, baseDir, fontsDir);
                        if (fullPath is null) continue;

                        // Registry names look like "宋体 & 新宋体 (TrueType)" / "Segoe UI (TrueType)".
                        var familyPart = regName
                            .Replace(" (TrueType)", "", StringComparison.OrdinalIgnoreCase)
                            .Replace(" (OpenType)", "", StringComparison.OrdinalIgnoreCase)
                            .Trim();
                        foreach (var fam in familyPart.Split('&').Select(s => s.Trim()))
                        {
                            if (fam.Length > 0) map.TryAdd(fam, fullPath);
                        }
                    }
                }
                finally
                {
                    root.Dispose();
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[XStat] FontsController: failed to enumerate fonts: {ex.Message}");
        }

        return map;
    }

    /// <summary>Resolve a font registry value (absolute path or bare filename) to an existing file.</summary>
    private static string? ResolveFontPath(string value, string baseDir, string fontsDir)
    {
        if (Path.IsPathRooted(value) && System.IO.File.Exists(value)) return value;

        var fileName = Path.GetFileName(value);
        foreach (var dir in new[] { baseDir, fontsDir })
        {
            if (string.IsNullOrEmpty(dir)) continue;
            var candidate = Path.Combine(dir, fileName);
            if (System.IO.File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static bool IsServedExtension(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext is ".ttf" or ".otf" or ".woff" or ".woff2";
    }
}
