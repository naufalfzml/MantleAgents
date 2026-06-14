## ADDED Requirements

### Requirement: FX Agent Default Flow template replicates agent-cron execution path
The file `n8n/templates/fx-agent-default-flow.json` SHALL define an n8n workflow with nodes connected in the order: Get Market Data → AI Signal Analysis → Guardrail Check → Risk Check → Execute Trade → Commit Attestation. The workflow MUST produce timeline events of the same types and in the same order as a single `agent-cron.ts` execution tick.

#### Scenario: Template is valid importable n8n workflow JSON
- **WHEN** `fx-agent-default-flow.json` is imported via the n8n REST API (`POST /api/v1/workflows`)
- **THEN** the import MUST succeed without errors and the workflow MUST be visible in the n8n editor canvas

#### Scenario: End-to-end workflow run produces equivalent timeline events
- **WHEN** the imported workflow is executed end-to-end in n8n (with the API in test/mock mode)
- **THEN** the timeline events written to Supabase MUST include the same event types (`decision_input`, `trade` or `trade_failed`, attestation) as a corresponding `agent-cron.ts` run for the same inputs

### Requirement: Template uses parameterised API_BASE_URL for bridge endpoints
All HTTP Request nodes in the template SHALL use `{{$env.API_BASE_URL}}` (or an equivalent n8n expression) as the base URL for bridge endpoint calls, not a hardcoded localhost address.

#### Scenario: API_BASE_URL variable is configurable without editing JSON
- **WHEN** an operator sets the `API_BASE_URL` environment variable in the n8n instance
- **THEN** all HTTP Request nodes in the workflow MUST resolve to `${API_BASE_URL}/api/n8n/<node>`

### Requirement: Template provisioned per user on first /orchestration visit
When an authenticated user opens `/orchestration` for the first time, the backend SHALL check whether they already have a workflow in the n8n instance. If not, it MUST POST the template to n8n's REST API with the user's `walletAddress` and derived API key substituted into the HTTP node credential fields, and store the resulting n8n workflow ID in `user_profiles` or a new `user_n8n_workflows` record.

#### Scenario: First visit provisions workflow for new user
- **WHEN** a user with no existing n8n workflow opens `/orchestration`
- **THEN** a workflow named `fx-agent-<walletAddress>` MUST be created in n8n and the workflow ID MUST be persisted for that user

#### Scenario: Repeat visit does not duplicate workflow
- **WHEN** a user who already has a provisioned workflow opens `/orchestration`
- **THEN** no new workflow MUST be created in n8n
