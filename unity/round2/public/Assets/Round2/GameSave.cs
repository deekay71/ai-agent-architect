using System; namespace Round2 {
 [Serializable] public class GameState { public bool[,] Board; public int Score; public int[] Pending; }
 public static class GameSave { public static string Save(GameState state) { throw new NotImplementedException("ROUND2_STUB:save"); }
 public static GameState Load(string json) { throw new NotImplementedException("ROUND2_STUB:save"); } }
}
