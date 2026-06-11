## ADDED Requirements

### Requirement: validateWorkflow is a pure synchronous function
`validateWorkflow(workflowJson, userConfig)` in `workflow-validator.ts` SHALL be a pure function with no network calls, no database reads, and no LLM calls. It MUST return `{ passed: boolean, issues: string[] }` synchronously. `userConfig` carries the user's guardrail limits from `agent_configs`.

#### Scenario: Valid workflow with all required nodes returns passed: true
- **WHEN** `validateWorkflow` is called with a workflow containing Guardrail Check and Risk Check nodes and all parameters within user limits
- **THEN** the result MUST be `{ passed: true, issues: [] }`

#### Scenario: Malformed workflow JSON does not throw
- **WHEN** `validateWorkflow` receives a workflow object with missing or null `nodes` field
- **THEN** the function MUST return `{ passed: false, issues: ['workflow structure invalid'] }` and MUST NOT throw

### Requirement: Workflows containing trade nodes must include a Risk Check node
If the generated workflow contains an "Execute Trade" node or any node that calls `POST /api/n8n/execute-trade`, `validateWorkflow` SHALL check for the presence of a "Risk Check" node. If absent, it MUST add `'missing required node: Risk Check'` to `issues` and set `passed: false`.

#### Scenario: Trade node without Risk Check fails validation
- **WHEN** a workflow has an "Execute Trade" node but no "Risk Check" node
- **THEN** `validation.passed` MUST be `false` and `issues` MUST contain a string matching `'missing.*Risk Check'`

#### Scenario: Trade node with Risk Check passes this rule
- **WHEN** a workflow has both "Execute Trade" and "Risk Check" nodes
- **THEN** this specific rule MUST NOT add an issue

### Requirement: Guardrail Check node is always required
`validateWorkflow` SHALL always check for the presence of a "Guardrail Check" node, regardless of whether the workflow includes trade nodes. If absent, it MUST add `'missing required node: Guardrail Check'` to `issues` and set `passed: false`.

#### Scenario: Workflow without Guardrail Check fails validation
- **WHEN** `validateWorkflow` is called on a workflow with no "Guardrail Check" node
- **THEN** `validation.passed` MUST be `false` and `issues` MUST mention Guardrail Check

### Requirement: Generated guardrail parameters must not exceed user account limits
`validateWorkflow` SHALL extract `maxValuePerTx`, `stopLossPct`, and any other guardrail parameters from the workflow's Guardrail Check node `parameters` field and compare them to the values in `userConfig`. If any generated value exceeds the corresponding user limit, it MUST add a descriptive issue and set `passed: false`.

#### Scenario: Trade amount exceeding user maxValuePerTx fails validation
- **WHEN** the workflow's Guardrail Check node specifies `maxValuePerTx: 50000` and the user's limit is `500`
- **THEN** `validation.passed` MUST be `false` and `issues` MUST mention the limit and the requested value

#### Scenario: Parameters within user limits pass this rule
- **WHEN** all guardrail parameters in the workflow are ≤ the user's configured limits
- **THEN** no guardrail-limit issues MUST be added

### Requirement: GeneratedWorkflow and WorkflowValidationResult types exported from packages/shared
`GeneratedWorkflow` (`{ workflowJson, summary, validation }`) and `WorkflowValidationResult` (`{ passed: boolean, issues: string[] }`) SHALL be exported from `packages/shared` and used consistently across the route, service, and frontend.

#### Scenario: Types importable without error
- **WHEN** `import type { WorkflowValidationResult } from '@jakartagents/shared'` is used in `apps/api` or `apps/web`
- **THEN** `pnpm type-check` MUST exit 0
