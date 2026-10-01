using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.SceneManagement;
using System.Collections;
public class SpikeTests {
 [UnityTest] public IEnumerator PrefabWasCreatedAndModified(){
  var p=Resources.Load<GameObject>("Block");Assert.IsNotNull(p);
  var go=Object.Instantiate(p);yield return null;
  Assert.AreEqual(new Vector3(2,3,1),go.transform.localScale);Assert.IsNotNull(go.GetComponent<BoxCollider2D>());Object.Destroy(go);
 }
 [UnityTest] public IEnumerator SceneWasCreatedAndModified(){
  yield return SceneManager.LoadSceneAsync("Spike",LoadSceneMode.Additive);
  var scene=SceneManager.GetSceneByName("Spike");Assert.IsTrue(scene.isLoaded);
  Assert.IsTrue(System.Array.Exists(scene.GetRootGameObjects(),g=>g.name=="ModifiedMarker"));
  yield return SceneManager.UnloadSceneAsync(scene);
 }
}