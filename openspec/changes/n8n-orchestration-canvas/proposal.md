## Why

The V2 vision positions MantleAgents as a no-code agent builder — but today all agent logic is hardcoded in `agent-cron.ts` with no way for users to visually inspect or customise the workflow. Adding an n8n orchestration canvas makes the agent's decision pipeline visible and modifiable without code, which is the foundational layer required before intent-to-workflow generation (Change 05) and the strategy marketplace (Change 06) can exist.

## What Changes

- Add n8n self-hosted service to the dev setup (docker-compose or documented standalone process) with a persistent workflow volume.
- Add `apps/api/src/routes/n8n-bridge.ts` — a set of REST endpoints that expose each internal agent function as an n8n-callable HTTP node, authenticated with a per-user API key derived from the existing SIWE session.
- Add shared type contracts in `packages/shared` for every bridge endpoint's request/response payload so the n8n↔backend interface is typed and verifiable.
- Add `n8n/templates/fx-agent-default-flow.json` — a workflow JSON that replicates the current `agent-cron.ts` execution path as connected n8n nodes (Get Market Data → AI Signal Analysis → Guardrail Check → Risk Check → Execute Trade → Commit Attestation).
- Add `/orchestration` page in `apps/web` that embeds the n8n editor via iframe with SSO token handoff so users see their own workflow canvas without leaving the dashboard.

## Capabilities

### New Capabilities

- `n8n-bridge-api`: Authenticated REST endpoints wrapping each agent function (market data, LLM signal, guardrail check, risk check, trade execution, attestation commit) as discrete n8n-callable HTTP nodes with typed request/response contracts.
- `n8n-workflow-template`: The "FX Agent Default Flow" JSON template that mirrors `agent-cron.ts` behavior as a visual n8n workflow, importable per user.
- `orchestration-canvas-ui`: The `/orchestration` page in `apps/web` embedding the n8n editor with per-user SSO so each logged-in user sees and can edit their own workflow.

### Modified Capabilities

*(none — `agent-cron.ts` continues running as the default execution path; n8n runs in parallel as the "advanced/custom" option)*

## Impact

- `docker-compose.yml` (new) or `docs/N8N_SETUP.md` — n8n service provisioning
- `apps/api/src/routes/n8n-bridge.ts` — new route plugin
- `apps/api/src/routes/n8n-bridge.test.ts` — new test file
- `packages/shared` — bridge payload types
- `apps/web/src/app/(app)/orchestration/` — new page + iframe component
- `n8n/templates/fx-agent-default-flow.json` — new template file
- `apps/api` env vars — `N8N_BRIDGE_API_KEY_SECRET` for per-user key derivation; `N8N_BASE_URL` for the embed URL
- `apps/web` env vars — `NEXT_PUBLIC_N8N_BASE_URL` for iframe src
