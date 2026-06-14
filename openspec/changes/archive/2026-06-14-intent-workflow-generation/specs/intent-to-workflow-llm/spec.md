## ADDED Requirements

### Requirement: POST /workflow/generate accepts prompt and returns structured result
The endpoint `POST /workflow/generate` SHALL accept `{ prompt: string, walletAddress: string }` and return `{ workflowJson: object | null, summary: string, validation: { passed: boolean, issues: string[] } }`. The endpoint MUST be accessible only to authenticated users (validated via the existing SIWE middleware).

#### Scenario: Valid trading prompt returns workflow JSON and summary
- **WHEN** `POST /workflow/generate` is called with a coherent trading strategy prompt and a valid authenticated `walletAddress`
- **THEN** the response MUST include a non-null `workflowJson`, a non-empty `summary` string, and `validation.passed` reflecting the validator result

#### Scenario: Unauthenticated request returns 401
- **WHEN** `POST /workflow/generate` is called without a valid session JWT
- **THEN** the response MUST be HTTP 401

### Requirement: workflow-generator constructs system prompt from available node schema
`workflow-generator.ts` SHALL build the LLM system prompt by auto-deriving the `AVAILABLE_NODES` list from `packages/shared` bridge payload types (from Change 04). The prompt MUST list each node's name, purpose, input fields, and output fields so the LLM can assemble semantically correct connections.

#### Scenario: Generated workflow uses only nodes from the available list
- **WHEN** a prompt is processed and a workflow is returned
- **THEN** every node in `workflowJson.nodes` MUST have a `name` that matches one of the declared available nodes

### Requirement: Gemini called with structured output schema constraining workflow JSON
The LLM call in `workflow-generator.ts` SHALL use `Output.object({ schema: N8nWorkflowSchema })` (the same pattern as `llm-analyzer.ts`) to constrain the output to a typed n8n workflow structure. If Gemini returns output that cannot be parsed against the schema, the service MUST return `{ workflowJson: null, summary: 'Generation failed: invalid model output', validation: { passed: false, issues: ['invalid JSON from model'] } }` without throwing a 500.

#### Scenario: LLM returns parseable structured workflow
- **WHEN** Gemini returns a JSON object matching `N8nWorkflowSchema`
- **THEN** `workflowJson` MUST be the parsed object and `summary` MUST be a non-empty description

#### Scenario: LLM returns malformed output — graceful error, no 500
- **WHEN** the mocked Gemini response is broken JSON or missing required schema fields
- **THEN** the endpoint MUST return HTTP 200 with `{ workflowJson: null, validation: { passed: false, issues: ['invalid JSON from model'] } }` and MUST NOT return HTTP 500

### Requirement: System prompt maps honeypot/risk language to Risk Check node
The system prompt SHALL contain an explicit rule: "When the user mentions honeypot detection or contract risk, always use the 'Risk Check' node (transaction simulation / GoPlus). Never use an LLM node for risk detection." Generated workflows MUST NOT contain an LLM node in the position of risk detection when a risk-related instruction appears in the prompt.

#### Scenario: Prompt mentioning contract risk produces Risk Check node, not AI node
- **WHEN** the prompt contains "detect honeypot" or "no honeypot risk"
- **THEN** the generated workflow MUST include a "Risk Check" node and MUST NOT include a node named "AI Signal Analysis" or equivalent in the risk-check position

### Requirement: Every generation attempt is logged to generated_workflows
Regardless of validation outcome (pass or fail) or LLM parse success, `workflow-generator.ts` SHALL insert a row into `generated_workflows` with `wallet_address`, `prompt`, `output_json` (null if parse failed), `validation_result`, and `created_at`.

#### Scenario: Successful generation logged
- **WHEN** a prompt produces a valid workflow that passes validation
- **THEN** a row MUST exist in `generated_workflows` with `output_json` non-null and `validation_result.passed = true`

#### Scenario: Failed validation still logged
- **WHEN** a generated workflow fails validation (e.g. missing Risk Check node)
- **THEN** a row MUST still be inserted in `generated_workflows` with `validation_result.passed = false` and the relevant `issues` array
