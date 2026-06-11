## ADDED Requirements

### Requirement: Bridge endpoints exposed under /api/n8n/ for each agent function
The API SHALL expose the following endpoints as Fastify route handlers registered under the `/api/n8n/` prefix, each wrapping its corresponding internal service function:

- `POST /api/n8n/market-data` → calls market data service; returns price, kline, risk summary
- `POST /api/n8n/signal-analysis` → calls `llm-analyzer.ts`; returns signal action, confidence, reasoning
- `POST /api/n8n/guardrail-check` → calls `rules-engine.ts`; returns pass/fail and adjusted plan
- `POST /api/n8n/risk-check` → calls GoPlus/contract simulation; returns risk score and flags
- `POST /api/n8n/execute-trade` → calls `trade-executor.ts`; returns `TradeResult`
- `POST /api/n8n/commit-attestation` → calls `attestation-service.ts`; returns attestation ID and `commitTxHash`

#### Scenario: Valid request to market-data endpoint returns typed response
- **WHEN** `POST /api/n8n/market-data` is called with a valid API key and `{ walletAddress, tokenAddress, chain }`
- **THEN** the response MUST conform to `N8nMarketDataResponse` from `packages/shared` and return HTTP 200

#### Scenario: Valid request to execute-trade endpoint proxies to trade-executor
- **WHEN** `POST /api/n8n/execute-trade` is called with valid params
- **THEN** `executeTrade` MUST be invoked with the exact parameters from the request body (no silent modification) and the response MUST include `success`, and either `txHash` or `failureCategory`

### Requirement: Bridge endpoints authenticate via per-user HMAC API key
Every `/api/n8n/*` endpoint SHALL validate the `X-N8N-Api-Key` header using `HMAC-SHA256(walletAddress, N8N_BRIDGE_API_KEY_SECRET)`. A missing or invalid key MUST return HTTP 401 without executing any internal logic.

#### Scenario: Missing API key returns 401
- **WHEN** a request to any `/api/n8n/*` endpoint is made without an `X-N8N-Api-Key` header
- **THEN** the response MUST be HTTP 401 and the internal service function MUST NOT be called

#### Scenario: Wrong API key returns 401
- **WHEN** a request carries an `X-N8N-Api-Key` that does not match `HMAC-SHA256(walletAddress, secret)`
- **THEN** the response MUST be HTTP 401

#### Scenario: Valid API key proceeds to service call
- **WHEN** a request carries a correctly computed `X-N8N-Api-Key` for the given `walletAddress`
- **THEN** the endpoint MUST execute the internal service function and return HTTP 200

### Requirement: Bridge payload types exported from packages/shared
Request and response types for each bridge endpoint SHALL be exported from `packages/shared` as `N8nBridgePayloads`. TypeScript compilation of both `apps/api` and `apps/web` MUST succeed with these types imported.

#### Scenario: Types importable without circular dependency
- **WHEN** `import type { N8nMarketDataRequest, N8nMarketDataResponse } from '@jakartagents/shared'` is used in `apps/api`
- **THEN** `pnpm type-check` MUST exit 0

### Requirement: N8N_BRIDGE_API_KEY_SECRET env var required at startup
The API server SHALL validate that `N8N_BRIDGE_API_KEY_SECRET` is set at startup. If missing, it MUST log a warning indicating the n8n bridge is disabled, and all `/api/n8n/*` endpoints MUST return HTTP 503 (not 401).

#### Scenario: Missing secret disables bridge with 503
- **WHEN** `N8N_BRIDGE_API_KEY_SECRET` is unset and a request hits `/api/n8n/market-data`
- **THEN** the response MUST be HTTP 503 with a descriptive error body
