## ADDED Requirements

### Requirement: AgentAttestationRegistry accepts and stores decisionHash
The updated `AgentAttestationRegistry.sol` SHALL add `bytes32 decisionHash` as a parameter to `commitAttestation`, store it in the `Attestation` struct, and emit it in the `AttestationCommitted` event.

#### Scenario: commitAttestation stores decisionHash on-chain
- **WHEN** `commitAttestation(agentId, runId, eventsHash, decisionHash, tradeCount)` is called
- **THEN** `getAttestation(agentId, runId)` MUST return the same `decisionHash` value that was passed in

#### Scenario: duplicate commit is rejected
- **WHEN** `commitAttestation` is called twice with the same `agentId` and `runId`
- **THEN** the second call MUST revert with `AlreadyCommitted()`

#### Scenario: AttestationCommitted event emitted with decisionHash
- **WHEN** a valid `commitAttestation` call is made
- **THEN** the `AttestationCommitted` event MUST be emitted and MUST include the `decisionHash` field

### Requirement: commitAttestationOnChain sends a viem writeContract call to Mantle
`commitAttestationOnChain(params)` in `attestation-service.ts` SHALL use a viem `WalletClient` to call `AgentAttestationRegistry.commitAttestation` on the configured Mantle network and return the resulting transaction hash.

#### Scenario: Successful on-chain commit returns commitTxHash
- **WHEN** `commitAttestationOnChain` is called with valid `agentId`, `runId`, `eventsHash`, `decisionHash`, and `tradeCount`
- **THEN** the function MUST return a non-empty `commitTxHash` string starting with `0x`

#### Scenario: On-chain commit failure does not throw from createAndAttachRunAttestation
- **WHEN** the Mantle RPC call fails (network error or revert)
- **THEN** `commitAttestationOnChain` MUST log a warning and return `null`, and `createAndAttachRunAttestation` MUST complete successfully with the Supabase attestation still stored

### Requirement: commitTxHash persisted in agent_attestations and returned by API
After a successful on-chain commit, the `commit_tx_hash` column in `agent_attestations` SHALL be updated with the transaction hash. The `GET /api/agent/:agentType/attestations/:id` endpoint SHALL include `commitTxHash` and a `commitTxExplorerUrl` in its response.

#### Scenario: commit_tx_hash column populated after successful on-chain commit
- **WHEN** `commitAttestationOnChain` returns a tx hash
- **THEN** the corresponding `agent_attestations` row MUST have `commit_tx_hash` set to that value

#### Scenario: API response includes commitTxHash
- **WHEN** `GET /api/agent/fx/attestations/:id` is called for an attestation with a completed on-chain commit
- **THEN** the response body MUST include `commitTxHash` and `commitTxExplorerUrl` as non-null strings

#### Scenario: API response for uncommitted attestation returns null commitTxHash
- **WHEN** `GET /api/agent/:agentType/attestations/:id` is called for an attestation where on-chain commit failed or has not run
- **THEN** `commitTxHash` in the response MUST be `null` and the endpoint MUST NOT return a 5xx error

### Requirement: createAndAttachRunAttestation accepts agentId parameter
`createAndAttachRunAttestation` SHALL accept `agentId: bigint` as a required parameter (passed from `agent-cron.ts` via `agent_configs.agent_8004_id`) and forward it to `commitAttestationOnChain`.

#### Scenario: agentId forwarded to on-chain commit
- **WHEN** `createAndAttachRunAttestation` is called with `agentId = 42n`
- **THEN** `commitAttestationOnChain` MUST be called with `agentId = 42n`
