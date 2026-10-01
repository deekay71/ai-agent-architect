using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
public static class ScenePrefabSpike {
 public static void Create() {
  System.IO.Directory.CreateDirectory("Assets/Resources");
  var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene);
  var obj=new GameObject("Block");obj.AddComponent<BoxCollider2D>();
  PrefabUtility.SaveAsPrefabAsset(obj,"Assets/Resources/Block.prefab");
  EditorSceneManager.SaveScene(scene,"Assets/Spike.unity");
  EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene("Assets/Spike.unity",true)};
 }
 public static void Modify() {
  var obj=PrefabUtility.LoadPrefabContents("Assets/Resources/Block.prefab");
  obj.transform.localScale=new Vector3(2,3,1);
  PrefabUtility.SaveAsPrefabAsset(obj,"Assets/Resources/Block.prefab");PrefabUtility.UnloadPrefabContents(obj);
  var scene=EditorSceneManager.OpenScene("Assets/Spike.unity");
  new GameObject("ModifiedMarker");EditorSceneManager.SaveScene(scene);
 }
}