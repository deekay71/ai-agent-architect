/** No imports or filesystem grants: deliberately abstaining local conformance reader, NOT an LLM. */
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => { input += chunk; if (input.length > 2_000_000) process.exit(2); });
process.stdin.on('end', () => {
  try {
    const request = JSON.parse(input) as { input: string; schemaName: string };
    const packet = JSON.parse(request.input) as { task: { constraints: { id: string }[] }; history: { content: string } };
    const output = request.schemaName === 'context_summary'
      ? { summary: `[UNTRUSTED LOCAL FIXTURE SUMMARY] ${packet.history.content.slice(0, Math.ceil(packet.history.content.length / 2))}` }
      : { disposition: 'abstain', answer: null, evidenceIds: [], revisions: [], constraints: packet.task.constraints.map(c => c.id), confidence: 0.5 };
    process.stdout.write(JSON.stringify(output));
  } catch { process.stderr.write('MOCK_REQUEST_INVALID'); process.exitCode = 2; }
});
