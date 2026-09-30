# Round-1 public Unity execution recipe

Use this controlled baseline for every A, B and C microtask. It is not a claim that an external Unity skill is complete.

1. Read the assigned entry in `tasks.json`. Change only its `targetFile` under `Assets/WalkingSkeleton/Tasks/`; preserve its `WalkingSkeleton.Tasks` namespace, public class, method signature and required Unity types.
2. Implement only the stated behavior. Validate specified null, range, dimension and coordinate inputs before computing. Use checked-safe comparisons or wider intermediates where the requirement can overflow `Int32`; saturation requirements return the stated bound.
3. Keep Unity APIs narrow: `JsonUtility` for the JSON round trip, `Vector2`/`Vector2Int` for vector tasks, and the supplied serializable public fields. Do not add editor hooks, filesystem/network/reflection/process APIs, new packages, or test changes.
4. Use the shared-host `unity_compile_test` tool after each candidate. Its private evaluation workspace copies only the candidate source and runs pinned hidden-source tests. A has one candidate plus one verification; B has at most two eligible repair candidates; C may iterate under its credit cap. Record compiler errors, test results, elapsed time and run ID.
5. Treat the broker receipt as the common implementation signal. Test source and assertions remain hidden; leave them unread and unchanged. Report the returned pass, model failure, or infrastructure failure without inferring unavailable test details.

Completion means the sole allowed target is implemented, its broker receipt is recorded, and no protected project file changed.
