using System;
using NUnit.Framework;
using UnityEngine;
using WalkingSkeleton.Tasks;

namespace WalkingSkeleton.Tests
{
    public sealed class WalkingSkeletonFixtureTests
    {
        [TestCase(-1, 0, 4, 0)] [TestCase(5, 0, 4, 4)] [TestCase(2, 0, 4, 2)] public void IntegerClamp_oracle(int value, int minimum, int maximum, int expected) => Assert.That(IntegerClamp.Clamp(value, minimum, maximum), Is.EqualTo(expected));
        [TestCase(0, 0, 2, 2, true)] [TestCase(2, 1, 2, 2, false)] [TestCase(0, 0, 0, 2, false)] public void CellBounds_oracle(int x, int y, int width, int height, bool expected) => Assert.That(CellBounds.Contains(x, y, width, height), Is.EqualTo(expected));
        [TestCase(0, 0, 3, 2, 0)] [TestCase(2, 1, 3, 2, 5)] [TestCase(1, 1, 2, 2, 3)] public void CoordinateIndex_oracle(int x, int y, int width, int height, int expected) => Assert.That(CoordinateIndex.ToIndex(x, y, width, height), Is.EqualTo(expected));
        [TestCase(new[] { true, true }, true)] [TestCase(new[] { true, false }, false)] [TestCase(new bool[0], false)] public void RowFull_oracle(bool[] cells, bool expected) => Assert.That(RowFull.IsFull(cells), Is.EqualTo(expected));
        [TestCase("", 18652613)] [TestCase("alpha", 1569418667)] [TestCase("alpha", 1569418667)] public void DeterministicSeed_oracle(string value, int expected) => Assert.That(DeterministicSeed.FromText(value), Is.EqualTo(expected));
        [TestCase(2, 3, 5)] [TestCase(int.MaxValue, 1, int.MaxValue)] [TestCase(int.MinValue, -1, int.MinValue)] public void ScoreAccumulation_oracle(int score, int delta, int expected) => Assert.That(ScoreAccumulation.Add(score, delta), Is.EqualTo(expected));
        [Test] public void JsonStateRoundtrip_preserves_scalar_state() { var output = JsonStateRoundtrip.RoundTrip(new State { score = 4, label = "safe" }); Assert.That(output.score, Is.EqualTo(4)); Assert.That(output.label, Is.EqualTo("safe")); }
        [Test] public void JsonStateRoundtrip_rejects_null() => Assert.Throws<ArgumentNullException>(() => JsonStateRoundtrip.RoundTrip(null));
        [TestCase(2, -1, 0.5f, 1f, -0.5f)] [TestCase(0, 3, 2f, 0f, 6f)] [TestCase(1, 1, 1f, 1f, 1f)] public void Vector2GridPosition_oracle(int x, int y, float cellSize, float expectedX, float expectedY) => Assert.That(Vector2GridPosition.ToWorld(x, y, cellSize), Is.EqualTo(new Vector2(expectedX, expectedY)));
        [TestCase(new[] { 0, 0, 0, 0 }, true)] [TestCase(new[] { 0, 0, 1, 0 }, false)] [TestCase(new int[0], false)] public void DuplicatePosition_oracle(int[] flat, bool expected) { var positions = new Vector2Int[flat.Length / 2]; for (var index = 0; index < positions.Length; index++) positions[index] = new Vector2Int(flat[index * 2], flat[index * 2 + 1]); Assert.That(DuplicatePosition.HasDuplicate(positions), Is.EqualTo(expected)); }
        [TestCase(0, 0, 1, 1, 2, 2, true)] [TestCase(1, 1, 1, 1, 2, 2, true)] [TestCase(1, 1, 2, 1, 2, 2, false)] public void PlacementBounds_oracle(int x, int y, int width, int height, int boardWidth, int boardHeight, bool expected) => Assert.That(PlacementBounds.CanPlace(new Vector2Int(x, y), new Vector2Int(width, height), new Vector2Int(boardWidth, boardHeight)), Is.EqualTo(expected));
    }
}
