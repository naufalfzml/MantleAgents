## Context

The existing agent pipeline lives entirely inside `agent-cron.ts` as a sequential TypeScript call chain. Each step (market data, LLM signal, guardrail, risk-check, trade, attestation) is a function call — not an addressable unit. n8n requires each "node" to be an independently callable HTTP endpoint.

The project already has:
- A Fastify v5 API with SIWE-based auth middleware (`apps/api/src/middleware/auth.ts`) — the middleware sets `request.user.walletAddress` from a validated JWT.
- Typed service functions for every agent step.
- A Next.js frontend with TanStack Query and authenticated app routes under `(app)/`.

There is no docker-compose, no n8n instance, and no bridge layer yet.

For the hackathon, the n8n integration runs **in parallel** with the existing cron — the cron remains the default execution path. n8n is the "advanced/custom" layer that demonstrates the no-code vision.

## Goals / Non-Goals

**Goals:**
- Each agent function accessible as an independent, authenticated REST endpoint.
- A per-user API key scheme that ties n8n HTTP node calls to a specific user's config without exposing their SIWE session JWT to n8n.
- A working default workflow template importable from n8n's UI.
- A `/orchestration` page that embeds the n8n editor for the logged-in user.

**Non-Goals:**
- Replacing `agent-cron.ts` (cron stays as fallback).
- AI generation of workflows from natural language (Change 05).
- Workflow marketplace (Change 06).
- Custom n8n node packages (npm-published community nodes) — HTTP nodes suffice for the hackathon.

## Decisions

**D1 — HTTP nodes, not custom npm n8n nodes**
Each agent function is exposed as a regular Fastify REST endpoint under `/api/n8n/`. n8n's built-in "HTTP Request" node calls these endpoints. No npm package publishing required.

*Alternative*: Custom n8n community nodes (npm packages). Rejected because they require publishing to npm and a restart of the n8n instance to install — too much friction for a hackathon demo.

**D2 — Per-user API key derived from HMAC(wallet_address, N8N_BRIDGE_API_KEY_SECRET)**
Each bridge request carries an `X-N8N-API-Key` header. The API validates it by recomputing `HMAC-SHA256(wallet_address, N8N_BRIDGE_API_KEY_SECRET)`. The `wallet_address` is passed as a request body field or path param alongside the key. This avoids a new database table while remaining user-scoped.

*Alternative*: Store API keys in Supabase `user_profiles`. Rejected for hackathon scope — adds migration and key management UI overhead. The HMAC approach is stateless and secure enough for demo.

**D3 — n8n runs as a docker service alongside the API**
A `docker-compose.yml` at repo root defines three services: `api` (the Fastify app), `web` (the Next.js app, optional for dev), and `n8n` (n8n self-hosted with a named volume for workflow persistence). `pnpm dev` remains the primary dev command for code; docker-compose is the full-stack command.

*Alternative*: Use n8n Cloud. Rejected because it requires an account/credit card and cannot call `localhost:4000` from the cloud without a tunnel — too many moving parts for a demo.

**D4 — SSO token handoff via URL query param to iframe**
The `/orchestration` page generates a short-lived token (signed JWT, 5-minute TTL) from the user's `walletAddress` and appends it to the n8n iframe `src` URL. n8n's built-in "external auth" or a lightweight URL-param mechanism passes this to the n8n instance for session initialisation.

*Note*: n8n's self-hosted SSO is limited. For the hackathon demo, the simplest approach is to embed the n8n editor URL with the user's n8n API key pre-provisioned via the n8n REST API at user login/first-visit. Document any limitations clearly.

**D5 — One workflow template, imported per user via n8n REST API at first visit**
When a user first opens `/orchestration`, the backend checks whether they already have a workflow in n8n (via `GET /api/v1/workflows` on the n8n instance). If not, it POSTs the `fx-agent-default-flow.json` template, substituting the user's API key and wallet address into the HTTP node credentials.

**D6 — Bridge endpoint request/response types in `packages/shared`**
All six bridge endpoints share a typed contract (`N8nBridgeRequest`, `N8nBridgeResponse`) with per-node variants. This makes the n8n↔backend interface independently testable and forward-compatible with the intent-to-workflow generator (Change 05).

## Risks / Trade-offs

- **[n8n ↔ localhost networking in Docker]** → The n8n container calls `http://api:4000` (Docker internal network), not `localhost:4000`. The bridge endpoint URL in the workflow template must use the Docker service name. Mitigation: parameterise `API_BASE_URL` in the template JSON; substitute at import time.
- **[n8n iframe Content-Security-Policy]** → Browsers block iframes from origins not in the parent's `frame-ancestors` CSP. Mitigation: set n8n's `N8N_EDITOR_BASE_URL` and configure the Next.js `Content-Security-Policy` header to allow framing from the n8n origin.
- **[Multi-tenant workflow isolation]** → n8n's self-hosted CE edition has a single workspace with no per-user isolation. For the demo, each user's workflow is prefixed with their wallet address in the workflow name, and the bridge API key ensures their n8n HTTP calls only touch their own data. Full isolation is a post-hackathon concern.
- **[Per-user API key rotation]** → The HMAC approach ties the key to `N8N_BRIDGE_API_KEY_SECRET`. Rotating the secret invalidates all keys. Acceptable for hackathon; document this limitation.

## Migration Plan

1. Add `docker-compose.yml` with n8n service.
2. Add bridge route plugin and shared types.
3. Add workflow template JSON.
4. Add first-visit provisioning logic in the `/orchestration` page API handler.
5. Add `/orchestration` page with iframe embed.
6. Manual end-to-end test.

No database migrations required. No changes to existing routes or cron logic.
