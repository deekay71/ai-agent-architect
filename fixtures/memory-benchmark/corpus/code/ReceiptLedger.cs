namespace Infrastructure;

public interface IReceiptStore
{
    bool Contains(string operationId);
    void Commit(string operationId);
}

public sealed class ReceiptLedger
{
    private readonly IReceiptStore store;
    public ReceiptLedger(IReceiptStore store) { this.store = store; }
    public bool IsCommitted(string operationId) { return store.Contains(operationId); }
    public void Record(string operationId) { store.Commit(operationId); }
}
