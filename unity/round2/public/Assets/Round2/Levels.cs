using System; namespace Round2 {
 [Serializable] public class LevelDef { public int Id; public int Target; }
 public static class Levels { public const int SchemaVersion=1;
 public static LevelDef[] Catalog() { throw new NotImplementedException("ROUND2_STUB:levels-1"); }
 public static bool IsUnlocked(int id,int[] completed) { throw new NotImplementedException("ROUND2_STUB:levels-1"); }
 }
}
