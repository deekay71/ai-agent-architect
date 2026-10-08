using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityPackageInfo = UnityEditor.PackageManager.PackageInfo;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Architect.Brain.Unity
{
    /// <summary>Explicit operator export only. Project-produced data, never independent evidence or authority.</summary>
    public static class BrainObservation
    {
        [Serializable] private sealed class ProjectConfig { public string schemaVersion; public string projectId; }
        [Serializable] public sealed class PackageFact { public string name; public string version; }
        [Serializable] public sealed class SceneFact { public string path; public bool loaded; public bool dirty; }
        [Serializable] public sealed class Observation
        {
            public string schemaVersion = "architect-unity-observation/1";
            public string adapterVersion = "0.2.0-preview.1";
            public string observationId;
            public string projectId;
            public string projectPath;
            public string observedAt;
            public string unityVersion;
            public string buildTarget;
            public bool playing;
            public bool compiling;
            public bool updating;
            public bool executionAuthorized = false;
            public string assurance = "project-produced-editor-metadata; no independent-verifier or gameplay acceptance";
            public PackageFact[] packages;
            public SceneFact[] scenes;
        }

        public static Observation Collect(string projectId)
        {
            if (!Guid.TryParse(projectId, out _)) throw new ArgumentException("A bootstrapped project ID is required.");
            var scenes = Enumerable.Range(0, SceneManager.sceneCount).Select(index =>
            {
                var scene = SceneManager.GetSceneAt(index);
                return new SceneFact { path = scene.path, loaded = scene.isLoaded, dirty = scene.isDirty };
            }).ToArray();
            return new Observation
            {
                observationId = Guid.NewGuid().ToString(),
                projectId = projectId,
                projectPath = Path.GetFullPath(Path.Combine(Application.dataPath, "..")),
                observedAt = DateTime.UtcNow.ToString("O"),
                unityVersion = Application.unityVersion,
                buildTarget = EditorUserBuildSettings.activeBuildTarget.ToString(),
                playing = EditorApplication.isPlaying,
                compiling = EditorApplication.isCompiling,
                updating = EditorApplication.isUpdating,
                packages = UnityPackageInfo.GetAllRegisteredPackages().OrderBy(p => p.name)
                    .Select(p => new PackageFact { name = p.name, version = p.version }).ToArray(),
                scenes = scenes
            };
        }

        [MenuItem("Tools/AI Agent Brain/Export Editor Observation")]
        public static void Export()
        {
            var root = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            var brain = Path.Combine(root, ".architect");
            var configPath = Path.Combine(brain, "project.json");
            RejectLink(brain);
            RejectLink(configPath);
            if (!File.Exists(configPath)) throw new InvalidOperationException("Run the host bootstrap for this project first; see SETUP.md.");
            var config = JsonUtility.FromJson<ProjectConfig>(File.ReadAllText(configPath));
            if (config == null || config.schemaVersion != "architect-project/1") throw new InvalidOperationException("Unsupported project configuration.");
            var observation = Collect(config.projectId);
            var output = Path.Combine(brain, "observations");
            RejectLink(output);
            Directory.CreateDirectory(output);
            var target = Path.Combine(output, observation.observationId + ".json");
            var temporary = target + ".tmp";
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            using (var writer = new StreamWriter(stream))
            {
                writer.Write(JsonUtility.ToJson(observation, true));
                writer.Flush();
                stream.Flush(true);
            }
            File.Move(temporary, target);
            Debug.Log("Architect Brain exported Editor metadata: " + target);
        }

        private static void RejectLink(string target)
        {
            if ((File.Exists(target) || Directory.Exists(target)) &&
                (File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Brain output/config must be project-local regular paths.");
        }
    }
}
