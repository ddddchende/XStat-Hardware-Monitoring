namespace XStat.Service.Models;

/// <summary>
/// A client-declared sensor subscription. Both fields are optional; a sensor is
/// delivered when it matches ANY rule:
///  - SensorIds:   exact id match, id substring match, or exact name match
///  - Conditions:  field match (id/name/category/type/unit/hardwareName),
///                 case-insensitive substring per field, all fields must match
/// Empty filter (both null) means "deliver nothing".
/// Clients that never call Subscribe receive the full snapshot (legacy behavior).
/// </summary>
public sealed class SensorFilter
{
    public string[]? SensorIds { get; set; }
    public Dictionary<string, string>[]? Conditions { get; set; }
}
