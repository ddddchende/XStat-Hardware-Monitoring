using XStat.Service.Hardware;
using XStat.Service.Hubs;
using XStat.Service.Services;

// Pin content root and web root to the directory containing the service exe.
// Without this, ASP.NET inherits the caller's working directory (e.g. src\app when
// launched by Electron), which means UseStaticFiles() can't find wwwroot.
var exeDir = AppContext.BaseDirectory;
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args            = args,
    ContentRootPath = exeDir,
    WebRootPath     = Path.Combine(exeDir, "wwwroot"),
});

// Allow running as a Windows Service (installed mode) or as a console app (dev mode).
builder.Host.UseWindowsService(opts => opts.ServiceName = "XStat Hardware Service");

// ─── Services ────────────────────────────────────────────────────────────────

builder.Services.AddSingleton<HardwareMonitor>();
builder.Services.AddSingleton<SensorBroadcastService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<SensorBroadcastService>());
builder.Services.AddSingleton<PanelLayoutStore>();
builder.Services.AddHostedService<DiscoveryBeaconService>();

builder.Services.AddSignalR(opts =>
{
    opts.EnableDetailedErrors = builder.Environment.IsDevelopment();
});

// CORS: allow the Electron renderer and panel browsers on any local origin.
builder.Services.AddCors(opts =>
{
    opts.AddDefaultPolicy(policy =>
    {
        policy
            .SetIsOriginAllowed(origin =>
            {
                if (string.IsNullOrEmpty(origin)) return false;
                // Electron renderer loads via file:// in production; such pages
                // send "Origin: null" — check before parsing, since "null" is
                // not a valid URI and new Uri() would throw (→ 500 on fonts).
                if (origin == "null" || origin.StartsWith("file://")) return true;
                var uri = new Uri(origin);
                // Allow localhost dev server / local Electron renderer
                if (uri.Host is "localhost" or "127.0.0.1" or "::1")   return true;
                // Allow LAN browsers that load the panel served by this same service.
                // The panel page is same-origin, so SignalR won't send an Origin header;
                // but pre-flight requests from some frameworks might. Allow private ranges.
                if (IsPrivateIp(uri.Host)) return true;
                return false;
            })
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddControllers();

// ─── Kestrel: listen on all interfaces so LAN panel access works ──────────────
var port = builder.Configuration.GetValue<int>("ServicePort", 9421);
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// ─── App Pipeline ────────────────────────────────────────────────────────────
var app = builder.Build();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // HTML entry pages must always revalidate so browsers (esp. phones)
        // pick up new hashed bundles after an app update — prevents stale
        // panels that silently lack newly added features.
        var path = ctx.Context.Request.Path.Value;
        if (path?.EndsWith(".html", StringComparison.OrdinalIgnoreCase) == true)
            ctx.Context.Response.Headers.CacheControl = "no-cache";
    },
});

app.MapControllers();
app.MapHub<SensorHub>("/hubs/sensors");

// Browsers always auto-request /favicon.ico — redirect to the actual icon file.
app.MapGet("/favicon.ico", () => Results.Redirect("/icon.ico", permanent: true));

// Health check — Electron uses this to know the service is ready. It also
// reports the running process's id + executable path so the Electron shell can
// detect a stale service from an older install occupying the port and replace it.
app.MapGet("/health", () =>
{
    bool isAdmin = OperatingSystem.IsWindows()
        ? new System.Security.Principal.WindowsPrincipal(
              System.Security.Principal.WindowsIdentity.GetCurrent())
          .IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator)
        : true;
    return Results.Ok(new
    {
        status = "ok",
        version = "0.1.0",
        isAdmin,
        processId = Environment.ProcessId,
        executablePath = Environment.ProcessPath
    });
});

app.Run();

// Returns true for RFC-1918 private IPv4 ranges (LAN panel browsers).
static bool IsPrivateIp(string host)
{
    if (!System.Net.IPAddress.TryParse(host, out var ip)) return false;
    var b = ip.GetAddressBytes();
    if (b.Length != 4) return false;
    return b[0] == 10
        || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
        || (b[0] == 192 && b[1] == 168);
}

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}
