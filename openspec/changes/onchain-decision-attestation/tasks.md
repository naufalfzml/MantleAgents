## 1. Database Migration

- [x] 1.1 Create `supabase/migrations/<timestamp>_add_commit_tx_hash.sql` adding `commit_tx_hash text` column (nullable) to `agent_attestations`
- [ ] 1.2 Apply migration locally (`supabase db push` or equivalent) and verify column exists

## 2. Smart Contract Update

- [x] 2.1 Add `bytes32 decisionHash` field to the `Attestation` struct in `AgentAttestationRegistry.sol`
- [x] 2.2 Add `bytes32 decisionHash` parameter to `commitAttestation()` function signature
- [x] 2.3 Add `decisionHash` to the `AttestationCommitted` event definition and emission
- [x] 2.4 Update `getAttestation()` return values to include `decisionHash`
- [x] 2.5 Write/update contract test: commit with `decisionHash` → `AttestationCommitted` event emits it; `getAttestation` returns it; duplicate `runId` reverts with `AlreadyCommitted()`
- [x] 2.6 Run `cd packages/contracts && pnpm test` — all tests green
- [ ] 2.7 Deploy updated contract to Mantle Sepolia: `pnpm --filter @mantleagents/contracts deploy:attestation-registry`
- [ ] 2.8 Record new contract address; update `MANTLE_ATTESTATION_REGISTRY_ADDRESS` in `.env` and `apps/api/.env.example`

## 3. ABI Update

- [x] 3.1 Regenerate `apps/api/src/abis/attestation-registry.ts` from the newly compiled Hardhat artifact (copy ABI array from `artifacts/contracts/AgentAttestationRegistry.sol/AgentAttestationRegistry.json`)
- [x] 3.2 Verify the updated ABI includes `decisionHash` in the `commitAttestation` inputs and `AttestationCommitted` event

## 4. Decision Hash Computation

- [x] 4.1 Add `computeDecisionHash(input: { signal, guardrailParams, marketDataSnapshot })` to `attestation-service.ts` using `stableStringify` + `createHash('sha256')`; return 64-char lowercase hex
- [x] 4.2 Add `decisionHash: string | null` to the `AttestationPayload` interface
- [x] 4.3 Update `hashEvents` call in `createAndAttachRunAttestation` to also extract the `decision_input` event and compute `decisionHash` from its `summary` JSON; set `null` when event is absent

## 5. agent-cron: decision_input Event

- [x] 5.1 In `agent-cron.ts`, after LLM signal generation and guardrail evaluation, build a snapshot object `{ signal, guardrailParams, marketDataSnapshot }`
- [x] 5.2 Insert `decision_input` timeline event with `summary = JSON.stringify(snapshot)` before the `executeTrade` call
- [x] 5.3 Confirm the event's `created_at` is earlier than subsequent `trade` / `trade_failed` events in the same run

## 6. On-Chain Commit Implementation

- [x] 6.1 Add `commitAttestationOnChain(params: { agentId, runId, eventsHash, decisionHash, tradeCount })` to `attestation-service.ts` using a viem `WalletClient` (same pattern as `agent-registry.ts`)
- [x] 6.2 On success, return `commitTxHash`; on failure, log a structured warning and return `null` (do not throw)
- [x] 6.3 Update `createAndAttachRunAttestation` to accept `agentId: bigint` as a new required parameter
- [x] 6.4 After Supabase insert succeeds, call `commitAttestationOnChain`; update `agent_attestations.commit_tx_hash` with the result if non-null
- [x] 6.5 Update all callers of `createAndAttachRunAttestation` in `agent-cron.ts` to pass `agentId` from `agent_configs.agent_8004_id`

## 7. API Endpoint Extension

- [x] 7.1 Extend the attestation detail endpoint (`GET /api/agent/:agentType/attestations/:id`) to include `decisionHash`, `eventsHash`, `commitTxHash`, and `commitTxExplorerUrl` in the response
- [x] 7.2 Verify `commitTxExplorerUrl` uses `mantleExplorerTxUrl()` from `chains.ts`
- [x] 7.3 Verify response returns `commitTxHash: null` (not 5xx) when the column is NULL

## 8. Unit Tests

- [x] 8.1 Add `attestation-service.test.ts` (or extend existing): `computeDecisionHash` determinism test (same input → same hash)
- [x] 8.2 Test: `computeDecisionHash` key-order invariance (different key order → same hash)
- [x] 8.3 Test: different confidence → different hash
- [x] 8.4 Test: `createAndAttachRunAttestation` with mock `decision_input` event → `payload.decisionHash` populated
- [x] 8.5 Test: `createAndAttachRunAttestation` without `decision_input` event → `payload.decisionHash` is `null`, no throw
- [x] 8.6 Test: `commitAttestationOnChain` mock RPC failure → returns `null`, does not throw
- [x] 8.7 Run `cd apps/api && pnpm vitest run src/services/attestation-service.test.ts` — all green

## 9. Integration Test (Mantle Sepolia)

- [x] 9.1 Create `apps/api/src/services/attestation-onchain.integration.test.ts` (skipped in CI, run manually)
- [x] 9.2 Test: commit dummy attestation → read back via `getAttestation(agentId, runId)` → verify returned `eventsHash` and `decisionHash` match what was sent
- [ ] 9.3 Run integration test manually with testnet credentials; confirm tx appears in Mantle Sepolia explorer

## 10. UI — Run Detail Page

- [x] 10.1 Add `commitTxHash`, `commitTxExplorerUrl`, `decisionHash`, `eventsHash` to the Run Detail data fetch (TanStack Query)
- [x] 10.2 Build decision trail section: signal action + confidence → guardrail result → trade outcome
- [x] 10.3 Add `decisionHash` and `eventsHash` display fields with click-to-copy
- [x] 10.4 Add "Verified on-chain" badge (link to `commitTxExplorerUrl`) when `commitTxHash` is non-null
- [x] 10.5 Show "Attestation pending" neutral state when `commitTxHash` is null
- [ ] 10.6 Run `pnpm dev`; open a completed run in the dashboard; visually verify badge and hashes render correctly

## 11. Cleanup & Documentation

- [x] 11.1 Update README Mantle Integration table with new `AgentAttestationRegistry` contract address
- [x] 11.2 Run `pnpm type-check` — exit 0
- [x] 11.3 Run `pnpm --filter @mantleagents/web build` — exit 0
