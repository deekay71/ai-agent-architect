using System; namespace Round2 {
 public sealed class BoardCore {
 public const int ContractVersion=1;
 public BoardCore(bool[,] cells) { }
 public bool CanPlace(int x,int y,int[][] offsets) { throw new NotImplementedException("ROUND2_STUB:board-1"); }
 public bool Place(int x,int y,int[][] offsets) { throw new NotImplementedException("ROUND2_STUB:board-1"); }
 public bool[,] Snapshot() { throw new NotImplementedException("ROUND2_STUB:board-1"); }
 public int Bomb(int x,int y) { throw new NotImplementedException("ROUND2_STUB:board-2"); }
 }
}
