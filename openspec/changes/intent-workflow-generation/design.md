## Context

The project uses Gemini 2.5 Flash via `ai-sdk-provider-gemini-cli` with the `generateText` + `Output.object({ schema: SignalSchema })` pattern from `llm-analyzer.ts`. This pattern produces typed, Zod-validated structured output from the LLM — the same approach applies here with a more complex schema (an n8n workflow JSON object).

The n8n bridge nodes defined in Change 04 are the vocabulary for generated workflows. Each node has a name (e.g. "Get Market Data"), an endpoint URL, and typed request/response fields. Giving the LLM this schema as context is what lets it assemble a semantically correct workflow rather than hallucinating arbitrary node names.

Validation must happen server-side before the workflow reaches n8n. The validator is a pure function (no LLM, no network calls) — it checks structural completeness and guardrail parameter bounds. This separation means the validator is fast, deterministic, and independently testable.

Important carry-over from Change 00: when a user prompt mentions "AI honeypot detection", the system prompt instructs the LLM to map this to the "Risk Check" node (transaction simulation / GoPlus), not an AI node. The system prompt is the enforcement point for correct node semantics.

## Goals / Non-Goals

**Goals:**
- Generate valid n8n workflow JSON from a natural-language prompt using Gemini structured output.
- Enforce Guardrail Check and Risk Check node presence via the validator before deploy.
- Validate generated guardrail parameters against the user's account limits.
- Log every generation attempt (success and failure) to `generated_workflows`.
- A chat UI with preview and a guarded deploy button on `/orchestration`.

**Non-Goals:**
- Auto-deployment without user confirmation.
- Generative editing of an existing workflow (generate-from-scratch only for MVP).
- Fine-tuning or training the model on user feedback.
- Supporting non-Gemini LLM providers for workflow generation (can be added later via `model-router.ts`).

## Decisions

**D1 — Zod schema defines the n8n workflow structure the LLM must output**
A `N8nWorkflowSchema` Zod object (stored in `workflow-generator.ts`) describes the subset of n8n workflow JSON that the generator cares about: `name`, `nodes[]` (each with `type`, `name`, `parameters`), and `connections`. The LLM is constrained to this schema via `Output.object({ schema: N8nWorkflowSchema })`.

*Alternative*: Accept free-form JSON from the LLM and validate post-hoc. Rejected because free-form output frequently produces structurally invalid n8n JSON; schema-constrained output eliminates most parse failures.

**D2 — Node schema injected into the system prompt as a JSON snippet**
The system prompt includes a `AVAILABLE_NODES` section listing each bridge node's name, description, input fields, and output fields (derived from the `packages/shared` bridge types from Change 04). The LLM is instructed to use only nodes from this list.

This is the same "tools as schema" pattern recommended in the reference doc. It means the vocabulary is single-sourced from Change 04's types — if a new node is added, the system prompt updates automatically.

**D3 — Validator is a pure synchronous function; generator calls it after LLM response**
`validateWorkflow(workflowJson, userConfig)` takes the parsed workflow and the user's `agent_configs` row, returns `{ passed: boolean, issues: string[] }`. The route handler calls `generateWorkflow` then `validateWorkflow` in sequence. The database record is written regardless of validation outcome (audit log captures both).

**D4 — System prompt explicitly maps honeypot/risk language to the Risk Check node**
The system prompt contains a rule: "When the user mentions 'honeypot detection', 'contract risk', or 'AI risk check', always use the 'Risk Check' node (which uses transaction simulation and GoPlus), never an AI/LLM node for this purpose." This is the enforcement point for the semantic correction from Change 00.

**D5 — Ambiguous/overclaiming prompts get a workflow with conservative guardrails + a disclaimer note**
If a prompt implies guaranteed profit (e.g. "strategy that always wins"), the system prompt instructs the LLM to add a `notes` field to the workflow JSON containing a disclaimer, and to set conservative default guardrails. The validator checks for the presence of this disclaimer field when the prompt contains profit-guarantee language (keyword heuristic on the server side).

**D6 — "Deploy to Canvas" button POSTs workflow to n8n via the provisioning logic from Change 04**
On the frontend, clicking "Deploy" calls `POST /api/n8n/provision` (with the generated workflow JSON as the body) which replaces or imports the workflow into the user's n8n instance. The frontend disables the button when `validation.passed === false`.

**D7 — `generated_workflows` table stores the full audit trail**
Columns: `id`, `wallet_address`, `prompt` (text), `output_json` (jsonb, nullable — null if LLM returned invalid JSON), `validation_result` (jsonb: `{ passed, issues }`), `deployed` (boolean, default false), `created_at`. A trigger or application update sets `deployed = true` when the user clicks Deploy.

## Risks / Trade-offs

- **[LLM output quality]** → Gemini may generate syntactically valid but semantically wrong workflows (e.g. wrong connection order, missing parameters). Mitigation: the Zod schema enforces structure; the validator catches missing required nodes; the preview UI lets the user inspect before deploying.
- **[Schema drift between bridge types and system prompt]** → If Change 04's node schema changes, the system prompt must be regenerated. Mitigation: auto-derive the `AVAILABLE_NODES` snippet from `packages/shared` types at request time rather than hardcoding it in the prompt string.
- **[Token cost per generation]** → Generating a workflow JSON with a full system prompt is a large context call. For hackathon demo, this is acceptable. Mitigation: cache the `AVAILABLE_NODES` snippet (it only changes when code deploys).
- **[n8n import API compatibility]** → The generated workflow JSON must be compatible with the n8n version running in the Docker service from Change 04. Mitigation: test import of a generated workflow in CI using the template import path from Change 04.

## Open Questions

- Should `generated_workflows.output_json` store the raw LLM output or the validated + potentially auto-fixed JSON? Decision for implementation: store raw output; add a separate `fixed_json` column if auto-fix is implemented later.
- Should the validator auto-insert missing required nodes (auto-fix) or only report issues? MVP decision: report only — auto-fix is a post-hackathon enhancement.
