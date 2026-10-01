using System; using UnityEngine; using UnityEngine.EventSystems; namespace Round2 {
 public class Placement : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler {
  public bool[,] Board = new bool[4,4]; public Vector2Int[] Cells = {Vector2Int.zero}; public bool PreviewVisible; public Vector2Int Anchor;
  public void OnBeginDrag(PointerEventData data) { throw new NotImplementedException("ROUND2_STUB:placement"); }
  public void OnDrag(PointerEventData data) { throw new NotImplementedException("ROUND2_STUB:placement"); }
  public void OnEndDrag(PointerEventData data) { throw new NotImplementedException("ROUND2_STUB:placement"); }
  public void BeginDrag() { throw new NotImplementedException("ROUND2_STUB:placement"); }
  public bool Preview(Vector2Int anchor) { throw new NotImplementedException("ROUND2_STUB:placement"); }
  public bool Commit() { throw new NotImplementedException("ROUND2_STUB:placement"); }
  public void Cancel() { throw new NotImplementedException("ROUND2_STUB:placement"); }
 }
}
