## ADDED Requirements

### Requirement: computeDecisionHash produces a deterministic hex hash from decision input
`computeDecisionHash(input)` SHALL compute a SHA-256 hash of the stable-serialised `{ signal, guardrailParams, marketDataSnapshot }` object and return it as a lowercase 64-character hex string (32 bytes, compatible with Solidity `bytes32`). It MUST use `stableStringify` so key ordering does not affect the output.

#### Scenario: Same input always produces same hash
- **WHEN** `computeDecisionHash` is called twice with identical `signal`, `guardrailParams`, and `marketDataSnapshot` objects
- **THEN** both calls MUST return the identical hex string

#### Scenario: Key order does not affect hash
- **WHEN** `computeDecisionHash` is called with `{ guardrailParams: {a:1, b:2} }` and separately with `{ guardrailParams: {b:2, a:1} }`
- **THEN** both calls MUST return the identical hex string

#### Scenario: Different confidence score produces different hash
- **WHEN** `computeDecisionHash` is called with `signal.confidence = 0.7` and then with `signal.confidence = 0.8` (all other fields equal)
- **THEN** the two returned hex strings MUST differ

### Requirement: agent-cron writes decision_input timeline event before execution
After LLM signal generation and guardrail evaluation, and before `executeTrade` is called, `agent-cron.ts` SHALL insert a `decision_input` timeline event containing the JSON-serialised snapshot of `{ signal, guardrailParams, marketDataSnapshot }` in its `summary` field.

#### Scenario: decision_input event present in timeline before trade events
- **WHEN** an agent run completes with a trade
- **THEN** the timeline row with `event_type = 'decision_input'` MUST have a `created_at` timestamp earlier than the corresponding `trade` or `trade_failed` event in the same run

#### Scenario: decision_input event contains parseable JSON snapshot
- **WHEN** the `decision_input` timeline row is fetched
- **THEN** `JSON.parse(row.summary)` MUST succeed and the result MUST contain `signal`, `guardrailParams`, and `marketDataSnapshot` keys

### Requirement: AttestationPayload includes decisionHash alongside eventsHash
`AttestationPayload` SHALL include a `decisionHash` field (string | null). It MUST be populated from the `decision_input` timeline event of the run when present, and MUST be `null` for runs that predate this change (no crash on missing event).

#### Scenario: decisionHash populated when decision_input event exists
- **WHEN** `createAndAttachRunAttestation` is called for a run that has a `decision_input` event
- **THEN** `payload.decisionHash` MUST be a 64-char hex string derived from that event's snapshot

#### Scenario: decisionHash null when decision_input event absent
- **WHEN** `createAndAttachRunAttestation` is called for a run with no `decision_input` event
- **THEN** `payload.decisionHash` MUST be `null` and the function MUST NOT throw
