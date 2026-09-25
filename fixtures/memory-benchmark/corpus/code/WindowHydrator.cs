namespace Infrastructure;

public sealed class WindowHydrator
{
    public string LoadPinned(string sourceId, string revision) { return sourceId + revision; }
    public string Compact(string summary) { return summary; }
}
