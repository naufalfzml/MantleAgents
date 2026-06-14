## 1. Infrastructure — n8n Service

- [x] 1.1 Create `docker-compose.yml` at repo root with services: `api` (Fastify, port 4000), `n8n` (n8n self-hosted, port 5678), shared Docker network `mantleagents`
- [x] 1.2 Configure n8n service with a named volume (`n8n_data`) for workflow persistence and env vars: `N8N_BASIC_AUTH_ACTIVE=true`, `N8N_EDITOR_BASE_URL`, `WEBHOOK_URL`
- [x] 1.3 Add `N8N_BASE_URL`, `N8N_API_KEY` (n8n instance API key), `N8N_BRIDGE_API_KEY_SECRET` to `apps/api/.env.example`
- [x] 1.4 Add `NEXT_PUBLIC_N8N_BASE_URL` to `apps/web/.env.local.example`
- [ ] 1.5 Verify `docker compose up` starts both api and n8n; n8n UI accessible at `http://localhost:5678`

## 2. Shared Bridge Payload Types

- [x] 2.1 Add `N8nMarketDataRequest` and `N8nMarketDataResponse` types to `packages/shared`
- [x] 2.2 Add `N8nSignalAnalysisRequest` and `N8nSignalAnalysisResponse` types
- [x] 2.3 Add `N8nGuardrailCheckRequest` and `N8nGuardrailCheckResponse` types
- [x] 2.4 Add `N8nRiskCheckRequest` and `N8nRiskCheckResponse` types
- [x] 2.5 Add `N8nExecuteTradeRequest` and `N8nExecuteTradeResponse` types (reuse `TradeResult` from Change 03)
- [x] 2.6 Add `N8nCommitAttestationRequest` and `N8nCommitAttestationResponse` types
- [x] 2.7 Export all types from `packages/shared/index.ts`
- [x] 2.8 Run `pnpm type-check` — exit 0

## 3. n8n Bridge Route Plugin

- [x] 3.1 Create `apps/api/src/routes/n8n-bridge.ts` as a Fastify plugin registered under prefix `/api/n8n`
- [x] 3.2 Implement `validateN8nApiKey(walletAddress, key)` helper using `HMAC-SHA256(walletAddress, N8N_BRIDGE_API_KEY_SECRET)`
- [x] 3.3 Add startup check: if `N8N_BRIDGE_API_KEY_SECRET` is unset, register a catch-all `/api/n8n/*` handler returning HTTP 503
- [x] 3.4 Implement `POST /api/n8n/market-data` — validate key, call market data service, return `N8nMarketDataResponse`
- [x] 3.5 Implement `POST /api/n8n/signal-analysis` — validate key, call `llm-analyzer.ts`, return `N8nSignalAnalysisResponse`
- [x] 3.6 Implement `POST /api/n8n/guardrail-check` — validate key, call `rules-engine.ts`, return `N8nGuardrailCheckResponse`
- [x] 3.7 Implement `POST /api/n8n/risk-check` — validate key, call GoPlus/simulation, return `N8nRiskCheckResponse`
- [x] 3.8 Implement `POST /api/n8n/execute-trade` — validate key, call `executeTrade`, return `N8nExecuteTradeResponse`
- [x] 3.9 Implement `POST /api/n8n/commit-attestation` — validate key, call `createAndAttachRunAttestation`, return `N8nCommitAttestationResponse`
- [x] 3.10 Register `n8n-bridge.ts` plugin in main API server (`apps/api/src/index.ts`)

## 4. Bridge Route Tests

- [x] 4.1 Create `apps/api/src/routes/n8n-bridge.test.ts`
- [x] 4.2 Test: valid API key + valid body → 200 + response matches shared type schema for each of the 6 endpoints
- [x] 4.3 Test: missing `X-N8N-Api-Key` header → 401 for each endpoint
- [x] 4.4 Test: wrong `X-N8N-Api-Key` value → 401 for each endpoint
- [x] 4.5 Test: `execute-trade` endpoint with mock `trade-executor` → verify params forwarded unmodified
- [x] 4.6 Test: missing `N8N_BRIDGE_API_KEY_SECRET` env → all endpoints return 503
- [x] 4.7 Run `cd apps/api && pnpm vitest run src/routes/n8n-bridge.test.ts` — all green

## 5. Workflow Template

- [x] 5.1 Create directory `n8n/templates/`
- [x] 5.2 Build `n8n/templates/fx-agent-default-flow.json` as an n8n workflow export with 6 HTTP Request nodes in sequence: Get Market Data → AI Signal Analysis → Guardrail Check → Risk Check → Execute Trade → Commit Attestation
- [x] 5.3 Use `{{$env.API_BASE_URL}}` as the base URL in all HTTP Request node URLs
- [x] 5.4 Add `X-N8N-Api-Key` header expression `{{$credentials.n8nBridgeApiKey}}` to each HTTP Request node
- [ ] 5.5 Import template into a running local n8n instance via `POST /api/v1/workflows` and verify it loads without errors in the canvas

## 6. First-Visit Workflow Provisioning

- [x] 6.1 Add `n8n_workflow_id` column (nullable text) to `user_profiles` via a new Supabase migration
- [x] 6.2 Create `apps/api/src/services/n8n-provisioner.ts` with `provisionUserWorkflow(walletAddress)`: check `user_profiles.n8n_workflow_id`; if null, POST template to n8n REST API with substituted params; store returned workflow ID
- [x] 6.3 Add `GET /api/n8n/provision` endpoint (authenticated via existing SIWE middleware) that calls `provisionUserWorkflow` and returns `{ workflowId, n8nBaseUrl }`
- [x] 6.4 Verify idempotency: calling provision twice for the same user does not create a second workflow

## 7. /orchestration UI Page

- [x] 7.1 Create `apps/web/src/app/(app)/orchestration/page.tsx` — server component, fetches `GET /api/n8n/provision` on render
- [x] 7.2 Generate short-lived JWT (HMAC-SHA256, 5-minute TTL) from `walletAddress` server-side; append as `?token=<jwt>` to iframe `src`
- [x] 7.3 Render `<iframe src="{N8N_BASE_URL}/workflow/{workflowId}?token=..." />` with appropriate `allow` and `sandbox` attributes
- [x] 7.4 Add `frame-src {NEXT_PUBLIC_N8N_BASE_URL}` to Next.js `Content-Security-Policy` header in `next.config.ts`
- [x] 7.5 Add "Orchestration Canvas" navigation link in the sidebar/nav (next to existing agent pages)
- [x] 7.6 Verify page is protected by the `(app)` auth guard (unauthenticated → redirect to login)

## 8. Manual End-to-End Verification

- [ ] 8.1 Run `docker compose up`; verify n8n UI at `localhost:5678` and API at `localhost:4000`
- [ ] 8.2 Login to dashboard; open `/orchestration`; verify n8n canvas loads with the default workflow
- [ ] 8.3 Change `sentiment_threshold` parameter in the Guardrail Check node from 0.6 → 0.7; save workflow
- [ ] 8.4 Click "Execute Workflow" in n8n UI; verify new timeline events appear in the dashboard
- [ ] 8.5 Verify `decision_input` event in timeline reflects the updated 0.7 threshold
- [ ] 8.6 Login as a second test user; open `/orchestration`; verify a separate workflow is provisioned (different workflow ID, no cross-user data)

## 9. Cleanup

- [x] 9.1 Run `pnpm type-check` — exit 0
- [x] 9.2 Run `pnpm --filter @mantleagents/web build` — exit 0
- [x] 9.3 Add `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD`, `N8N_BASE_URL`, `N8N_API_KEY`, `N8N_BRIDGE_API_KEY_SECRET` to README environment variables table
