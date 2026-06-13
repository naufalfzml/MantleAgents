## Why

The project review identified intent-centric workflow generation as the "strongest feature — don't downplay it": users write a natural-language strategy prompt and the system generates a deployable n8n workflow. Without this, the n8n canvas built in Change 04 is a visual wrapper for a fixed workflow — impressive but not differentiated. This change is the primary UX unlock that makes MantleAgents a no-code agent builder rather than a cron-job wrapper.

## What Changes

- New `apps/api/src/services/workflow-generator.ts`: builds a system prompt from the available node schema (from Change 04), calls Gemini with structured output (`Output.object`), and returns a parsed n8n workflow JSON alongside a plain-language summary.
- New `apps/api/src/services/workflow-validator.ts`: validates the generated workflow for (1) required node presence (Guardrail Check always required; Risk Check required when trade nodes are present), and (2) guardrail parameters not exceeding the user's account limits from `agent_configs`.
- New `apps/api/src/routes/workflow-generator.ts`: `POST /workflow/generate` endpoint accepting `{ prompt, walletAddress }`, orchestrating generator → validator → audit log.
- Supabase migration: new `generated_workflows` table (`wallet_address`, `prompt`, `output_json`, `validation_result`, `created_at`) for audit logging of every generation attempt.
- `/orchestration` page extended (Change 04 base): chat input for prompt, preview panel showing workflow diagram + text summary, "Deploy to Canvas" button (disabled when validation fails), validation issue list.

## Capabilities

### New Capabilities

- `intent-to-workflow-llm`: LLM-driven generation of n8n workflow JSON from a natural-language strategy prompt, using the available node schema as a structured tool list for Gemini.
- `workflow-guardrail-validation`: Structural and parameter validation of generated workflows — enforcing required nodes and user-account guardrail limits before a workflow can be deployed.
- `workflow-generation-ui`: Chat-style prompt input + workflow preview + deploy button on the `/orchestration` page.

### Modified Capabilities

*(none — existing n8n canvas and bridge API from Change 04 are consumed but not modified)*

## Impact

- `apps/api/src/services/workflow-generator.ts` — new service
- `apps/api/src/services/workflow-validator.ts` — new service
- `apps/api/src/services/workflow-generator.test.ts` — new tests
- `apps/api/src/services/workflow-validator.test.ts` — new tests
- `apps/api/src/routes/workflow-generator.ts` — new route plugin
- `supabase/migrations/` — `generated_workflows` table
- `apps/web/src/app/(app)/orchestration/` — chat + preview component added to existing page
- `packages/shared` — `GeneratedWorkflow`, `WorkflowValidationResult` types
- Depends on Change 04 (`n8n-bridge-api` node schema) and Change 03 (`agent_configs` guardrail limits)
