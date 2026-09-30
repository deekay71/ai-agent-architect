using System;
using UnityEngine;
namespace WalkingSkeleton.Tasks { public static class Vector2GridPosition { public static Vector2 ToWorld(int x, int y, float cellSize) { if (cellSize <= 0) throw new ArgumentOutOfRangeException(nameof(cellSize)); return new Vector2(x * cellSize, y * cellSize); } } }
