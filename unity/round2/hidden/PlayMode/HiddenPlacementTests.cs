using System.Collections;
using NUnit.Framework;
using Round2;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.SceneManagement;
using UnityEngine.EventSystems;
public class HiddenPlacementTests {
 [UnityTest,Category("T3")] public IEnumerator PointerDragCommitsThroughUnityEvents(){var go=new GameObject();var events=new GameObject();var system=events.AddComponent<EventSystem>();var p=go.AddComponent<Placement>();var data=new PointerEventData(system){position=new Vector2(1.2f,2.2f)};p.OnBeginDrag(data);p.OnDrag(data);Assert.IsTrue(p.PreviewVisible);p.OnEndDrag(data);Assert.IsTrue(p.Board[1,2]);Assert.IsFalse(p.PreviewVisible);Object.Destroy(go);Object.Destroy(events);yield return null;}

 [UnityTest,Category("T3")] public IEnumerator PrefabAndSceneDeliverable(){var prefab=Resources.Load<GameObject>("Block");Assert.IsNotNull(prefab,"Required Block.prefab missing");Assert.IsNotNull(prefab.GetComponent<Placement>());Assert.IsNotNull(prefab.GetComponent<BoxCollider2D>());Assert.IsNotNull(prefab.GetComponent<SpriteRenderer>());yield return SceneManager.LoadSceneAsync("Board",LoadSceneMode.Additive);Assert.IsTrue(SceneManager.GetSceneByName("Board").isLoaded);yield return SceneManager.UnloadSceneAsync("Board");}
 [UnityTest,Category("T3")] public IEnumerator PreviewDoesNotMutateAndCommitOccupies(){var go=new GameObject();var p=go.AddComponent<Placement>();p.Cells=new[]{Vector2Int.zero,new Vector2Int(1,0)};p.BeginDrag();Assert.IsTrue(p.Preview(new Vector2Int(1,1)));Assert.IsTrue(p.PreviewVisible);Assert.IsFalse(p.Board[1,1]);Assert.IsTrue(p.Commit());Assert.IsTrue(p.Board[1,1]);Assert.IsTrue(p.Board[2,1]);Assert.IsFalse(p.PreviewVisible);Object.Destroy(go);yield return null;}
 [UnityTest,Category("T3")] public IEnumerator InvalidPreviewAndPlacementAreAtomic(){var go=new GameObject();var p=go.AddComponent<Placement>();p.Board[1,1]=true;p.Cells=new[]{Vector2Int.zero,new Vector2Int(1,0)};p.BeginDrag();Assert.IsFalse(p.Preview(new Vector2Int(0,1)));Assert.IsFalse(p.PreviewVisible);Assert.IsFalse(p.Commit());Assert.IsFalse(p.Board[0,1]);Assert.IsFalse(p.Preview(new Vector2Int(3,3)));Object.Destroy(go);yield return null;}
 [UnityTest,Category("T3")] public IEnumerator CancelRemovesVisibleGhost(){var go=new GameObject();var p=go.AddComponent<Placement>();p.BeginDrag();Assert.IsTrue(p.Preview(Vector2Int.zero));var preview=go.transform.Find("Preview");Assert.IsNotNull(preview,"Visible ghost child missing");Assert.IsTrue(preview.gameObject.activeSelf);var renderer=preview.GetComponent<SpriteRenderer>();Assert.IsNotNull(renderer);Assert.IsNotNull(renderer.sprite);Assert.Less(renderer.color.a,1f);Assert.Greater(renderer.color.a,0f);p.Cancel();Assert.IsFalse(p.PreviewVisible);Assert.IsFalse(preview.gameObject.activeSelf);Assert.IsFalse(p.Board[0,0]);Object.Destroy(go);yield return null;}
}
