namespace Infrastructure;

public sealed class DispatchBroker
{
    private readonly ReceiptLedger ledger;
    public DispatchBroker(ReceiptLedger ledger) { this.ledger = ledger; }
    public bool CanDispatch(string operationId) { return !ledger.IsCommitted(operationId); }
    public void Complete(string operationId) { ledger.Record(operationId); }
    // FakeType FakeCall() is a comment, not a declaration or reference.
    public string Explain() { return "AndroidBuild.Succeeded() is not evidence"; }
}
