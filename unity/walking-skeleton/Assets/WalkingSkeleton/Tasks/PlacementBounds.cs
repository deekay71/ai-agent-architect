using UnityEngine;
namespace WalkingSkeleton.Tasks { public static class PlacementBounds { public static bool CanPlace(Vector2Int origin, Vector2Int size, Vector2Int board) => size.x > 0 && size.y > 0 && board.x > 0 && board.y > 0 && origin.x >= 0 && origin.y >= 0 && origin.x + size.x <= board.x && origin.y + size.y <= board.y; } }
