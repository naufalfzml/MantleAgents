## Context

`attestation-service.ts` already computes `eventsHash` (SHA-256 of timeline event summaries) and HMAC-signs a payload before storing it to Supabase. However:

1. **No `decisionHash`**: the hash covers what *happened* (events), not what *drove* the decision (LLM signal + guardrail parameters + market snapshot). A judge cannot verify that the AI logic matched what was claimed.
2. **No on-chain commit in the happy path**: `AgentAttestationRegistry.commitAttestation()` exists in Solidity and the ABI file exists, but `createAndAttachRunAttestation` never calls it — the attestation lives only in Supabase.
3. **Contract gap**: `AgentAttestationRegistry.sol` stores only `eventsHash + tradeCount`. Adding `decisionHash` requires a contract update and redeploy.

The goal is to close all three gaps in one change so the full pipeline — signal → hash → Supabase + on-chain commit → dashboard verification — works end-to-end.

## Goals / Non-Goals

**Goals:**
- `computeDecisionHash` produces a deterministic `bytes32`-compatible hex from `{ signal, guardrailParams, marketDataSnapshot }` using the existing `stableStringify` utility.
- `agent-cron.ts` writes a `decision_input` timeline event before execution so the decision snapshot is stored in the same audit trail as execution events.
- `createAndAttachRunAttestation` (or a `commitAttestationOnChain` helper it calls) sends a viem `writeContract` call to `AgentAttestationRegistry.commitAttestation(agentId, runId, eventsHash, decisionHash, tradeCount)` on Mantle.
- The resulting `commitTxHash` is stored in the `agent_attestations.commit_tx_hash` column and returned from the attestation detail API endpoint.
- The contract is updated to accept `decisionHash`, redeployed to Mantle Sepolia, and the ABI file + README are updated.
- A "Verified on-chain" badge in the Run Detail UI links to the commit tx on the Mantle explorer.

**Non-Goals:**
- Changing `IdentityRegistry` or `ReputationRegistry`.
- Changing guardrail or LLM logic.
- Full ZK proof of decision correctness (out of scope for hackathon).
- Backfilling `decisionHash` for runs before this change.

## Decisions

**D1 — `decisionHash` as SHA-256 of stable-serialised decision input, expressed as hex `0x...`**
Use the existing `stableStringify` + `createHash('sha256')` pattern already in `attestation-service.ts`. Output as a 32-byte hex string castable to Solidity `bytes32`.

*Alternative*: keccak256 (via viem `keccak256`). Rejected for off-chain computation because Node's `crypto.createHash('sha256')` is simpler and already used; the on-chain contract does not verify the hash itself, it only stores it.

**D2 — `decision_input` event written to timeline before execution**
`agent-cron.ts` writes a structured timeline event `{ event_type: 'decision_input', summary: JSON.stringify(snapshot) }` after LLM + guardrail evaluation and before `executeTrade`. This event is then included in `eventsHash` computation (improving it) and separately extracted for `decisionHash`.

*Alternative*: Store snapshot directly in the attestation payload without a timeline event. Rejected because the timeline is the single audit log — storing it there means the decision is independently queryable and the existing `hashEvents` function benefits from it automatically.

**D3 — `commitAttestationOnChain` as a standalone function called from `createAndAttachRunAttestation`**
Isolate the viem `writeContract` call in a separate `commitAttestationOnChain(params)` function. `createAndAttachRunAttestation` calls it after the Supabase insert succeeds and stores the `commitTxHash` via an update. If the on-chain commit fails it logs a warning but does NOT throw — the Supabase attestation is still valid.

*Alternative*: Throw on commit failure. Rejected because a transient Mantle RPC error should not invalidate an otherwise complete attestation run.

**D4 — `AgentAttestationRegistry.sol` updated: add `decisionHash` to `commitAttestation` and `AttestationCommitted`**
Add `bytes32 decisionHash` as the fifth parameter to `commitAttestation(agentId, runId, eventsHash, decisionHash, tradeCount)` and to the `Attestation` struct and `AttestationCommitted` event. The `AlreadyCommitted` deduplication guard is preserved.

*Alternative*: Use a separate `commitDecisionHash` function to avoid redeploying the core contract. Rejected because it doubles the on-chain calls per run and splits the event log.

**D5 — Supabase migration adds `commit_tx_hash text` column to `agent_attestations`**
A new migration file in `supabase/migrations/` adds the nullable `commit_tx_hash` column. Existing rows are unaffected (NULL = not yet committed on-chain).

**D6 — ABI file regenerated from the updated contract, not hand-edited**
After redeployment, run the Hardhat `compile` artifact output to extract the updated ABI and overwrite `apps/api/src/abis/attestation-registry.ts`. This prevents the hand-edit drift that caused the current scaffold state.

## Risks / Trade-offs

- **[Contract redeploy required]** → New contract address must be updated in `MANTLE_ATTESTATION_REGISTRY_ADDRESS` env var and documented in README. Old attestations on the previous contract address are not migrated (acceptable for a hackathon demo — document explicitly).
- **[Mantle Sepolia RPC reliability]** → `commitAttestationOnChain` could fail on RPC errors. Mitigation: D3 decision to soft-fail with warning; add a Supabase flag `commit_tx_hash IS NULL` that can be used to replay uncommitted attestations.
- **[`decision_input` event changes `eventsHash`]** → Adding the `decision_input` event to the timeline changes what `hashEvents` produces, so any previously stored `eventsHash` values are no longer reproducible by rerunning the same agent with the new code. Mitigation: this is acceptable for a forward-only change; document in the migration notes that pre-existing attestations use `schema: 'mantleagents/attestation-v1'` and new ones use `'mantleagents/attestation-v2'`.
- **[`agentId` required for on-chain commit]** → `createAndAttachRunAttestation` currently does not have access to the ERC-8004 `agentId`. It must be added as a parameter (passed from `agent-cron.ts`, which already has it via `agent_configs.agent_8004_id`).

## Migration Plan

1. Write Supabase migration for `commit_tx_hash` column.
2. Update `AgentAttestationRegistry.sol`; deploy to Mantle Sepolia; record new address.
3. Regenerate ABI file.
4. Implement `computeDecisionHash`, `commitAttestationOnChain`, and `decision_input` event logic.
5. Update `createAndAttachRunAttestation` signature to accept `agentId`.
6. Update `agent-cron.ts` to pass `agentId` and write `decision_input` event.
7. Extend attestation detail API endpoint.
8. Add UI badge.
9. Run integration test against Mantle Sepolia; update README.

**Rollback**: Set `MANTLE_ATTESTATION_REGISTRY_ADDRESS` back to the old contract address. The `commitAttestationOnChain` call will fail (wrong ABI), log a warning, and the system falls back to Supabase-only attestation — same behaviour as before this change.
