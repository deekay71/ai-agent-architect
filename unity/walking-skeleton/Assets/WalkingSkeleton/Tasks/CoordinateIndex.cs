using System;
namespace WalkingSkeleton.Tasks { public static class CoordinateIndex { public static int ToIndex(int x, int y, int width, int height) { if (!CellBounds.Contains(x, y, width, height)) throw new ArgumentOutOfRangeException(); return y * width + x; } } }
