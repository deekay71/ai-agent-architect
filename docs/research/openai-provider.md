# OpenAI provider: local implementation and protocol tests

Observed: 2026-09-25. User scope for this delivery is **finish implementation and run local tests only**. No provider generation, token-count request, API-key lookup, paid benchmark or account-access probe was performed. The test transport is injected and labelled `assurance: mock`.

## Provider boundary

`src/providers/types.ts` defines the neutral request, usage, count and result contracts. `createOpenAIProvider()` in `src/providers/openai.ts` uses the built-in Fetch API against exactly `https://api.openai.com/v1/responses` and `/responses/input_tokens`. Production credentials are supplied through `OPENAI_API_KEY` or an explicit in-memory option. There is no base-URL override, redirect following, automatic retry, tool execution or model fallback.

The caller pins `model`, optional `reasoningEffort`, instructions, input, JSON schema/name and `maxOutputTokens`. `requestDigest` is `digest(ModelRequest)` using the existing canonical contract serializer. Both calls snapshot the request before awaiting transport. The count request carries every input-bearing field, including the same instructions, schema, reasoning and `truncation: disabled`; generation adds `store: false`, `stream: false`, `service_tier: default` and the output limit. Generation-only controls are absent from the count API's documented parameter schema. OpenAI's token-count endpoint includes request structure and schema overhead; local byte counts are not a substitute. [Token counting guide](https://developers.openai.com/api/docs/guides/token-counting), [count endpoint reference](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count).

`respond()` requires a successful count of the exact request in the same provider instance. After restart or process-local count eviction it requires recounting. A failed recount clears prior admission for that request. A changed request cannot reuse the count. Returned provider usage is authoritative: a count disagreement preserves known actual usage but makes the result incomplete. Missing/malformed usage stays null. A model/tier mismatch or unpriced cache-write usage also stays unknown for cost settlement, retaining the campaign's unresolved reservation.

Structured output uses `text.format` with `type: json_schema` and `strict: true`. The adapter rejects refusal, incomplete generation, unexpected tool output and malformed JSON as successful answers. The caller still validates parsed JSON against the task's domain contract; valid JSON is not correctness or evidence of model understanding. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

The timeout covers headers and response-body reads; defaults are 60 seconds, 1 MiB request and 2 MiB response. Non-2xx bodies and transport error details are discarded. Errors carry bounded codes and, when available, an HTTP status and request ID. Prompt bytes, credentials, provider error bodies and reasoning text are never returned by the adapter.

## Reservation and accounting contract

`estimateCostMicros(usage, pricing)` and `reserveCostMicros(inputTokens, maxOutputTokens, pricing)` require explicit model-specific price inputs, source and observation date. They compute decimal arithmetic with integers, rounding upward once to integer USD micros. No mutable price defaults are embedded. The reservation charges every allowed output token and applies no cache discount. The campaign owns persistence, aggregate limits, price/model binding and settlement; provider errors cannot be treated as zero-cost success.

The standard text estimate includes uncached input, cached input and output. Reasoning tokens are a subset of reported output and are not charged twice. The output limit covers all generated output, including reasoning; a response can incur usage and still be incomplete. The estimate is not an invoice or a claim about unobserved surcharges. [Reasoning token accounting](https://developers.openai.com/api/docs/guides/reasoning).

## Local evidence and remaining qualification

The 17 tests in `test/openai-provider.test.ts` pass using local transport fixtures. They cover payload/digest identity, exact recount admission, mutation races, invalid inputs, usage/count/model/tier mismatches, refusal/incomplete/invalid JSON, deadline/body bounds, redirect/retry exclusion, error redaction and exact decimal pricing. Command:

```sh
./scripts/dev.sh build
./scripts/dev.sh exec node --test dist/test/openai-provider.test.js
```

These tests verify our protocol handling, not account entitlement, real model behavior, live token counts or provider latency. Provider-backed benchmark evidence, fresh sealed holdout evaluation and human calibration remain deferred. Model quality/cost routing is a campaign policy; this adapter does not decide which model may replace another.
