using System;
using UnityEngine;
namespace WalkingSkeleton.Tasks { [Serializable] public sealed class State { public int score; public string label; } public static class JsonStateRoundtrip { public static State RoundTrip(State state) { if (state == null) throw new ArgumentNullException(nameof(state)); return JsonUtility.FromJson<State>(JsonUtility.ToJson(state)); } } }
