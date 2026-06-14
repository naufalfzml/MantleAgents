## Why

The hackathon's core differentiator claim is that every agent decision is permanently recorded on-chain on Mantle — but today `createAndAttachRunAttestation` only hashes timeline event summaries (`eventsHash`) and stores them in Supabase; no on-chain `commitAttestation` call is being made in the happy path, and there is no `decisionHash` capturing the actual LLM signal + guardrail parameters that drove the decision. Without this, the "on-chain decision benchmarking" headline is not yet true.

## What Changes

- Add `computeDecisionHash(input)` to `attestation-service.ts` — SHA-256 of stable-serialised `{ signal, guardrailParams, marketDataSnapshot }`.
- Add `decisionHash` field to `AttestationPayload` alongside existing `eventsHash`.
- Add `agent-cron.ts` step: after LLM + guardrail evaluation and before execution, write a `decision_input` timeline event containing the decision snapshot used for hashing.
- Implement / verify the on-chain `commitAttestation` viem call in `attestation-service.ts` so each run actually commits `(agentId, runId, eventsHash, decisionHash, tradeCount)` to `AgentAttestationRegistry` on Mantle, and stores the resulting `commitTxHash` in the Supabase attestation row.
- Update `AgentAttestationRegistry.sol` to accept `decisionHash bytes32` as an additional parameter and emit it in the `AttestationCommitted` event.
- Update the ABI file `apps/api/src/abis/attestation-registry.ts` to match the updated contract.
- Extend `GET /api/agent/:agentType/attestations/:id` to return `decisionHash`, `eventsHash`, and `commitTxHash` (on-chain explorer link).
- Add a "Verified on-chain" badge with explorer link to the Run Detail UI page in `apps/web`.

## Capabilities

### New Capabilities

- `decision-hash-computation`: Deterministic SHA-256 hashing of the LLM signal + guardrail parameters + market data snapshot that drove a single agent decision, stored as `decisionHash` in the attestation payload.
- `onchain-attestation-commit`: Viem-based call to `AgentAttestationRegistry.commitAttestation()` on Mantle that anchors `eventsHash + decisionHash + runId + agentId` permanently on-chain, with the resulting `commitTxHash` persisted in Supabase.
- `attestation-verification-ui`: Run Detail page UI component showing the full decision trail (signal → guardrail → execution → on-chain hash) and a "Verified on-chain" badge linking to the Mantle explorer tx.

### Modified Capabilities

*(none — `AgentAttestationRegistry.sol` changes are additive; existing `eventsHash` field is preserved)*

## Impact

- `apps/api/src/services/attestation-service.ts` — new `computeDecisionHash`, updated `AttestationPayload`, new on-chain commit logic
- `apps/api/src/services/agent-cron.ts` — new `decision_input` timeline event before execution
- `packages/contracts/contracts/AgentAttestationRegistry.sol` — `decisionHash` added to `commitAttestation` signature and `AttestationCommitted` event
- `packages/contracts/deploy/` — updated deploy script for `attestation-registry`
- `apps/api/src/abis/attestation-registry.ts` — ABI updated to match contract
- `apps/api` routes — attestation detail endpoint extended
- `apps/web` — Run Detail page / component updated
- Supabase `agent_attestations` table — `commit_tx_hash` column needed (migration)
- `README.md` — Mantle Integration table updated with new contract address after redeploy
