using System.Collections.Generic;
using UnityEngine;
namespace WalkingSkeleton.Tasks { public static class DuplicatePosition { public static bool HasDuplicate(Vector2Int[] positions) { if (positions == null || positions.Length < 2) return false; var seen = new HashSet<Vector2Int>(); foreach (var position in positions) if (!seen.Add(position)) return true; return false; } } }
