using NUnit.Framework; using Round2; public class PublicSmoke {
[Test] public void ClearEmpty(){Assert.AreEqual(0,LineRules.Clear(new bool[4,4]).Score);}
[Test] public void SupplyThree(){Assert.AreEqual(3,BlockSupply.Next(1).Length);}
[Test] public void SaveRoundTrip(){var s=new GameState{Board=new bool[2,2],Score=7,Pending=new[]{1,2,3}};Assert.AreEqual(7,GameSave.Load(GameSave.Save(s)).Score);}
[Test] public void LevelOneUnlocked(){Assert.IsTrue(Levels.IsUnlocked(1,new int[0]));}
[Test] public void PlacementCancel(){var go=new UnityEngine.GameObject();try{var p=go.AddComponent<Placement>();p.BeginDrag();p.Cancel();Assert.IsFalse(p.PreviewVisible);}finally{UnityEngine.Object.DestroyImmediate(go);}}
[Test] public void LevelSelection(){var go=new UnityEngine.GameObject();try{var m=go.AddComponent<LevelMenu>();Assert.IsFalse(m.Select(3,new int[0]));}finally{UnityEngine.Object.DestroyImmediate(go);}}
[Test] public void EmptyBomb(){Assert.AreEqual(0,new BoardCore(new bool[4,4]).Bomb(1,1));}
[Test] public void BoardBounds(){Assert.IsFalse(new BoardCore(new bool[4,4]).CanPlace(-1,0,new[]{new[]{0,0}}));}
}