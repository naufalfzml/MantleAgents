## ADDED Requirements

### Requirement: cloneStrategyToCanvas provisions n8n workflow for the renter
`cloneStrategyToCanvas(renterWallet, workflowJson, strategyTitle)` in `strategy-clone.ts` SHALL call the n8n provisioning path from Change 04 (`provisionUserWorkflow`) with the provided `workflowJson`, creating or replacing the renter's n8n workflow. The cloned workflow name SHALL be prefixed with the strategy title to distinguish it from the renter's own default workflow.

#### Scenario: Clone calls n8n provisioning with correct workflow JSON
- **WHEN** `cloneStrategyToCanvas` is called with a valid `workflowJson` and a renter wallet
- **THEN** `provisionUserWorkflow` (or the n8n REST import endpoint) MUST be called with the `workflowJson` and the renter's `walletAddress`

#### Scenario: Renter with no existing n8n instance gets provisioned on clone
- **WHEN** the renter has never opened `/orchestration` and has no n8n workflow yet
- **THEN** `cloneStrategyToCanvas` MUST still succeed by triggering provisioning first

### Requirement: cloneStrategyToCanvas returns the n8n workflow ID on success
On a successful clone, `cloneStrategyToCanvas` SHALL return the n8n workflow ID assigned by the n8n instance, so the rental record and UI can link directly to the cloned workflow.

#### Scenario: Successful clone returns a workflow ID
- **WHEN** `cloneStrategyToCanvas` completes without error
- **THEN** it MUST return a non-empty string `workflowId`

### Requirement: cloneStrategyToCanvas failure does not silently succeed
If the n8n import call fails, `cloneStrategyToCanvas` SHALL throw or return a structured error that the `rent` endpoint can catch and return as a 502 (n8n unavailable) or 500, rather than creating a `strategy_rentals` row for a workflow that was not actually cloned.

#### Scenario: n8n import failure propagates as error
- **WHEN** the n8n REST API returns an error during workflow import
- **THEN** `cloneStrategyToCanvas` MUST throw or return an error, and the rent endpoint MUST NOT insert a `strategy_rentals` row
