using System;
namespace WalkingSkeleton.Tasks { public static class IntegerClamp { public static int Clamp(int value, int minimum, int maximum) { if (minimum > maximum) throw new ArgumentException("range"); return Math.Min(maximum, Math.Max(minimum, value)); } } }
