## 1. Database Migration

- [ ] 1.1 Create `supabase/migrations/<timestamp>_create_generated_workflows.sql` with table: `id uuid primary key`, `wallet_address text`, `prompt text`, `output_json jsonb`, `validation_result jsonb`, `deployed boolean default false`, `created_at timestamptz`
- [ ] 1.2 Apply migration locally and verify table exists

## 2. Shared Types

- [ ] 2.1 Add `N8nWorkflowSchema` Zod schema to `packages/shared` (or `apps/api` — decide based on whether web needs it; prefer `apps/api` if web only needs the summary/validation shape)
- [ ] 2.2 Add `GeneratedWorkflow` type (`{ workflowJson: object | null, summary: string, validation: WorkflowValidationResult }`) to `packages/shared`
- [ ] 2.3 Add `WorkflowValidationResult` type (`{ passed: boolean, issues: string[] }`) to `packages/shared`
- [ ] 2.4 Export both types from `packages/shared/index.ts`
- [ ] 2.5 Run `pnpm type-check` — exit 0

## 3. Workflow Validator Service

- [ ] 3.1 Create `apps/api/src/services/workflow-validator.ts`
- [ ] 3.2 Implement `validateWorkflow(workflowJson: unknown, userConfig: AgentConfigForRules): WorkflowValidationResult`
- [ ] 3.3 Add structural check: return `{ passed: false, issues: ['workflow structure invalid'] }` if `workflowJson.nodes` is missing or not an array
- [ ] 3.4 Add Guardrail Check node presence rule: if no node named "Guardrail Check" exists → add issue
- [ ] 3.5 Add Risk Check node presence rule: if any Execute Trade node exists and no "Risk Check" node → add issue
- [ ] 3.6 Add guardrail parameter bounds check: extract `maxValuePerTx`, `stopLossPct` from Guardrail Check node `parameters`; compare to `userConfig` limits; add issue per violation
- [ ] 3.7 Return `passed: true` iff `issues` array is empty

## 4. Workflow Validator Tests

- [ ] 4.1 Create `apps/api/src/services/workflow-validator.test.ts`
- [ ] 4.2 Test: complete workflow (Guardrail Check + Risk Check, params within limits) → `passed: true`
- [ ] 4.3 Test: missing Risk Check with Execute Trade node → `passed: false`, issue matches `'missing.*Risk Check'`
- [ ] 4.4 Test: missing Guardrail Check → `passed: false`, issue mentions Guardrail Check
- [ ] 4.5 Test: `maxValuePerTx` above user limit → `passed: false`, issue names the limit
- [ ] 4.6 Test: malformed workflow (null `nodes`) → `passed: false, issues: ['workflow structure invalid']`, no throw
- [ ] 4.7 Run `cd apps/api && pnpm vitest run src/services/workflow-validator.test.ts` — all green

## 5. Workflow Generator Service

- [ ] 5.1 Create `apps/api/src/services/workflow-generator.ts`
- [ ] 5.2 Build `buildNodeSchemaSnippet()`: derive `AVAILABLE_NODES` list from `packages/shared` bridge types; return as a JSON string for injection into the system prompt
- [ ] 5.3 Build `buildGeneratorSystemPrompt(nodeSchemaSnippet)`: include available nodes, the risk-check mapping rule ("honeypot → Risk Check node, not AI node"), the required node rule, and the conservative guardrails rule for profit-claiming prompts
- [ ] 5.4 Define `N8nWorkflowSchema` Zod schema: `{ name: string, nodes: array of { type, name, parameters }, connections: object }`
- [ ] 5.5 Implement `generateWorkflow(prompt, userConfig)`: call Gemini with `Output.object({ schema: N8nWorkflowSchema })`, build summary from result, call `validateWorkflow`, insert `generated_workflows` row, return `GeneratedWorkflow`
- [ ] 5.6 Handle LLM parse failure: catch schema validation error, return `{ workflowJson: null, summary: 'Generation failed: invalid model output', validation: { passed: false, issues: ['invalid JSON from model'] } }`, still insert audit row

## 6. Workflow Generator Tests

- [ ] 6.1 Create `apps/api/src/services/workflow-generator.test.ts`
- [ ] 6.2 Test: mock LLM returns valid workflow JSON → `workflowJson` non-null, `validation.passed` matches validator result
- [ ] 6.3 Test: mock LLM returns broken JSON → `workflowJson: null`, `validation.passed: false`, issue `'invalid JSON from model'`, no 500
- [ ] 6.4 Test: mock LLM returns workflow violating guardrail → `validation.passed: false` with correct issue (generator+validator integration)
- [ ] 6.5 Test: verify `generated_workflows` row inserted for both pass and fail cases (mock Supabase insert)
- [ ] 6.6 Run `cd apps/api && pnpm vitest run src/services/workflow-generator.test.ts` — all green

## 7. Route Plugin

- [ ] 7.1 Create `apps/api/src/routes/workflow-generator.ts` as a Fastify plugin with `POST /workflow/generate`
- [ ] 7.2 Apply existing SIWE auth middleware; extract `walletAddress` from `request.user`
- [ ] 7.3 Load user's `agent_configs` row (for guardrail limits) and pass to `generateWorkflow`
- [ ] 7.4 Return `GeneratedWorkflow` as JSON response; on unexpected error return HTTP 500 with structured error body
- [ ] 7.5 Register the plugin in `apps/api/src/index.ts`

## 8. UI — Chat + Preview on /orchestration

- [ ] 8.1 Add a `WorkflowGenerator` client component to `apps/web/src/app/(app)/orchestration/`
- [ ] 8.2 Render a textarea for prompt input and a "Generate Workflow" button; disable both during in-flight request
- [ ] 8.3 On submit, call `POST /workflow/generate` via TanStack Query mutation; show loading indicator
- [ ] 8.4 On success: render `summary` text and an ordered list of `workflowJson.nodes[].name`
- [ ] 8.5 On `validation.passed === false`: render each `validation.issues` item as a red error chip
- [ ] 8.6 Render "Deploy to Canvas" button; disable it when `validation.passed === false`
- [ ] 8.7 On "Deploy to Canvas" click: POST the `workflowJson` to the n8n provisioning import endpoint from Change 04; reload the n8n iframe `src` on success
- [ ] 8.8 Show error message toast if deploy call fails

## 9. Manual Demo Verification

- [ ] 9.1 Open `/orchestration`; enter the reference prompt ("Pantau likuiditas token XYZ, jika AI mendeteksi volume beli tinggi tanpa risiko honeypot, masuk posisi $500, TP 20%, SL 5%")
- [ ] 9.2 Verify preview shows node chain: Get Market Data → AI Signal Analysis → Risk Check → Guardrail Check → Execute Trade → Commit Attestation, with `$500` amount and correct TP/SL
- [ ] 9.3 Verify "Risk Check" node is present (honeypot mapping rule working)
- [ ] 9.4 Click "Deploy to Canvas" → verify workflow appears in n8n canvas iframe
- [ ] 9.5 Enter a prompt with trade amount exceeding user limit → verify "Deploy" button is disabled and issues list mentions the limit
- [ ] 9.6 Check `generated_workflows` table in Supabase — confirm rows for both tests above

## 10. Cleanup

- [ ] 10.1 Run `pnpm type-check` — exit 0
- [ ] 10.2 Run `pnpm --filter @jakartagents/web build` — exit 0
