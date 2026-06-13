# AGENTS.md

Guidance for Codex when working in this repository.

## Project Overview

MantleAgents runs autonomous AI agents (FX + Yield) that monitor markets, generate trading signals with Gemini, validate against guardrails, and execute trades. Built for **The Turing Test Hackathon 2026 (Mantle)** — Agentic Economy track. Every agent has an on-chain ERC-8004 identity on Mantle, and every run produces a hash-anchored attestation committed to a custom registry contract on Mantle.

## Commands

```bash
# Development
pnpm dev                              # Run all apps via turbo (API on :4000, Web on :3000)
pnpm build                            # Build all packages
pnpm type-check                       # Type check all packages
pnpm test                             # Run all tests
pnpm clean                            # Clean dist/build output

# API-specific
pnpm --filter @mantleagents/api dev   # Run API server in watch mode
pnpm --filter @mantleagents/api test  # Run API tests

# Web-specific
pnpm --filter @mantleagents/web dev   # Run Next.js dev server

# Single test file
cd apps/api && pnpm vitest run src/services/rules-engine.test.ts

# Contracts (Mantle Sepolia)
pnpm --filter @mantleagents/contracts deploy:tokens
pnpm --filter @mantleagents/contracts deploy:attestation-registry
pnpm --filter @mantleagents/contracts verify:registries
```

## Monorepo Structure

pnpm workspaces + Turborepo. Node 20 (`.nvmrc`). pnpm 9.15.0.

- **`apps/api`** -- Fastify v5 backend (API, crons, WebSocket)
- **`apps/web`** -- Next.js 16 frontend (React 19, Tailwind v4, shadcn/ui)
- **`packages/mantle-data`** -- Market data SDK (price/kline/holders/risk + non-Mantle execution)
- **`packages/contracts`** -- Solidity contracts (ERC-8004 ABIs, AgentAttestationRegistry, MockERC20) + deploy scripts for Mantle
- **`packages/shared`** -- Shared TypeScript types (agent configs, risk profiles, tokens)
- **`packages/db`** -- Supabase client factory + generated DB types
- **`packages/typescript-config`** -- Shared tsconfig bases (base, fastify, nextjs, node-library)
- **`supabase/migrations`** -- PostgreSQL migrations

## Architecture

### Mantle Chain Config (`apps/api/src/lib/chains.ts`)

Single source of truth for Mantle network config:
- `MANTLE_NETWORK` env (`testnet` | `mainnet`) selects `mantleSepoliaTestnet` (5003) or `mantle` (5000)
- `mantleRpcUrl()`, `mantleExplorerTxUrl()`, `mantleExplorerAddressUrl()` helpers
- `getIdentityRegistryAddress()`, `getReputationRegistryAddress()`, `getAttestationRegistryAddress()`, `getMantleUsdc/Usdt/Wmnt()` — all read from env and **throw if unset** (fail-loud rather than silently using a wrong/guessed address)

`apps/api/src/lib/chain-client.ts` exports a shared viem `PublicClient` for Mantle reads (vault sync, balance checks).

### Agent Identity & Reputation (`apps/api/src/services/agent-registry.ts`)

ERC-8004 on Mantle:
- `registerAgentOnChain()` — calls `IdentityRegistry.register(metadataUrl)`, parses `Registered` event for `agentId`, then links the execution wallet via `setAgentWallet` (EIP-712 signed, `chainId` = `MANTLE_CHAIN_ID`)
- `submitTradeFeedback()` — calls `ReputationRegistry.giveFeedback()` per trade
- `getAgentReputation()` / `getAgentOnChainInfo()` — read-only lookups

ABIs: `apps/api/src/abis/identity.ts`, `reputation.ts`.

### On-Chain Attestations (`apps/api/src/services/attestation-service.ts`)

Per-run timeline events are canonicalized + hashed (`eventsHash`), HMAC-signed (`ATTESTATION_SECRET`), and stored in Supabase (`agent_attestations`). The hash + `runId` + `agentId` are committed to `AgentAttestationRegistry` on Mantle (`apps/api/src/abis/attestation-registry.ts`, contract source in `packages/contracts/contracts/AgentAttestationRegistry.sol`) so the run is independently verifiable on-chain.

### Mantle Execution (`apps/api/src/services/realclaw-executor.ts`)

Mantle execution routes through **RealClaw / Byreal Skills CLI**, the agent layer that dispatches swaps to Merchant Moe / Agni Finance / Fluxion — non-custodial via Privy. `executeRealClawSwap()` is the entry point; `isRealClawConfigured()` gates whether this path is active. **Status: scaffolded, pending confirmation of the live API schema** at openclaw.mantle.xyz before wiring into `trade-executor.ts`.

### Agent Execution Loop (`apps/api/src/services/agent-cron.ts`)

60s tick cron queries `agent_configs` for agents where `next_run_at <= NOW()`:
1. Fetch positions + portfolio value
2. Fetch market data (`price-service.ts`, Merkl for yield)
3. Generate signals with Gemini 2.5 Flash (`llm-analyzer.ts`)
4. Validate signals against guardrails (`rules-engine.ts`)
5. Execute trades (`trade-executor.ts` → Mantle via `realclaw-executor.ts`, or `@mantleagents/mantle-data` for non-Mantle chains)
6. Log events to `agent_timeline`; commit attestation (`attestation-service.ts`)

### Token Monitor (`apps/api/src/services/token-monitor.ts`)

30s poll cron for token watchlist:
- Watchlist CRUD with auto contract risk check (transaction simulation / GoPlus) on token add
- Price alert matching (above/below threshold)
- Event emission via `agent-events.ts` for WebSocket broadcast

### Trade Executor (`apps/api/src/services/trade-executor.ts`)

- `executeTrade()` -- agent-driven trades (currency + direction + amount)
- `executeSwap()` -- manual swaps (arbitrary from/to pair)
- `signTransaction` callback pattern keeps private keys isolated
- Mantle trades route to `realclaw-executor.ts`; non-Mantle chains use `@mantleagents/mantle-data`'s `trade-chain-wallet`

### Market Data SDK (`packages/mantle-data`)

Wrapper around the AVE Cloud API, used for **non-Mantle** market data (prices, klines, holders, risk):
- Data REST: `https://data.ave-api.xyz/v2` (auth: `X-API-KEY`, env `MARKETDATA_API_KEY`)
- Trade API: `https://bot-api.ave.ai` (auth: `AVE-ACCESS-KEY`)
- `client.ts` -- Base HTTP client, 3x exponential backoff retry, rate-limit aware
- `data-rest.ts` -- data endpoints (token search, price, kline, holders, risk, wallet)
- `trade-chain-wallet.ts` -- Quote, EVM/Solana tx create+send, high-level `executeTrade`
- Exports: `MantleDataClient`, `MantleDataApiError`, `MantleDataApiResponse`, `MantleDataClientConfig`

### Price Service (`apps/api/src/services/price-service.ts`)

- `getTokenPrice(chain, address)` -- single token, 1min cache
- `fetchBatchPrices(tokenIds)` -- batch price fetch
- `fetchAllPrices(tokens)` -- for snapshot-cron + market-data-service

### API Routes

All routes prefixed `/api`. Groups: `auth`, `user`, `agent`, `monitor` (watchlist + alerts), `market`, `trade`, `conversation`, `selfclaw`, `ws` (WebSocket).

### Frontend (`apps/web`)

Next.js 16, React 19, App Router. Route groups: `(auth)` for onboarding, `(app)` for authenticated pages, `(marketing)` for landing.

Key pages: `/monitor` (watchlist + alerts), `/overview`, `/fx-agent`, `/yield-agent`, `/agent-chat`, `/swap`.

TanStack Query v5 for data fetching with auto-refetch. WebSocket for real-time progress streaming.

## Code Conventions

- ESM modules (`"type": "module"`)
- TypeScript strict mode
- Prettier: semicolons, single quotes, 2-space indent, trailing commas
- Tests: Vitest with globals, colocated `*.test.ts` files
- Routes: Fastify plugins (async functions accepting `FastifyInstance`)
- Services: pure functions with explicit params (no DI framework)
- Frontend: shadcn/ui primitives, client components in `_components/` dirs

## Environment Variables

**API** (`apps/api/.env.example`):
- Required: `MARKETDATA_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `THIRDWEB_SECRET_KEY`
- Mantle: `MANTLE_NETWORK`, `MANTLE_RPC_URL`, `MANTLE_IDENTITY_REGISTRY_ADDRESS`, `MANTLE_REPUTATION_REGISTRY_ADDRESS`, `MANTLE_ATTESTATION_REGISTRY_ADDRESS`, `MANTLE_USDC_ADDRESS`, `MANTLE_USDT_ADDRESS`, `MANTLE_WMNT_ADDRESS`
- Mantle execution: `REALCLAW_API_BASE`, `REALCLAW_API_KEY`
- Signing: `EVM_SIGNER_PRIVATE_KEY`, `SOLANA_SIGNER_PRIVATE_KEY`
- AI: `PARALLEL_API_KEY` (news), `GEMINI_CLI_AUTH_TYPE`
- Defaults: `PORT=4000`, `MARKETDATA_DEFAULT_CHAIN=bsc`, `CORS_ORIGIN=http://localhost:3000`

**Web** (`apps/web/.env.local`):
- `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`, `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`)

## Database

Supabase (PostgreSQL) with RLS. Primary identity key: `wallet_address`. Key tables: `user_profiles`, `agent_configs` (incl. `agent_8004_id` ERC-8004 token id), `agent_timeline`, `agent_attestations`, `token_watchlist`, `price_alerts`, `token_price_snapshots`, `yield_positions`.
