using UnityEngine; namespace Round2 {
 public class LegacyBoard:MonoBehaviour {
 public BoardCore Core;
 public bool[,] Cells=new bool[4,4];
 public bool Put(int x,int y) { if(x<0||y<0||x>=4||y>=4||Cells[x,y]) return false; Cells[x,y]=true; return true; }
 }
}
