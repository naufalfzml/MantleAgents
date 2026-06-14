## Context

`realclaw-executor.ts` was written as an interface-only scaffold when the live API schema at `openclaw.mantle.xyz` was not yet available. The file exports `executeRealClawSwap()` and `isRealClawConfigured()` but both are no-ops: `callRealClawSkill` throws immediately because the skill name (`'dex-swap'`), payload keys, and auth scheme are all marked `TODO`. `trade-executor.ts` references `isRealClawConfigured()` but the Mantle branch silently falls through rather than routing to `executeRealClawSwap`.

The RealClaw / Byreal Skills CLI layer operates at `openclaw.mantle.xyz`. It provides a server-wallet execution path (non-custodial via Privy) that handles DEX routing across Merchant Moe, Agni Finance, and Fluxion internally — the caller just specifies token pair, amount, and slippage. The Privy flow means swaps require a confirmation step before the transaction is broadcast; the executor must poll for final status.

The hackathon deadline makes this change time-sensitive: the Byreal integration score (18 pts) is gated on a working, verifiable on-chain swap.

## Goals / Non-Goals

**Goals:**
- Implement `executeRealClawSwap()` against the confirmed live API schema.
- Make `isRealClawConfigured()` reliable and fail-loud at startup.
- Wire `trade-executor.ts` so Mantle trades route through RealClaw with an explicit, observable fallback.
- All RealClaw result states map to timeline events consumed by the existing attestation pipeline.
- Unit tests cover success, 4xx, 5xx/retry, and `pending_confirmation` polling paths.

**Non-Goals:**
- Changing guardrail logic (`rules-engine.ts`).
- Changing the attestation or cron scheduling logic.
- Supporting non-Mantle chains via RealClaw.
- Building a UI for swap status.

## Decisions

**D1 — Structured result type instead of throw**
`executeRealClawSwap` returns a discriminated union `{ status: 'success' | 'failed' | 'pending_confirmation' | 'error', txHash?, amountOut?, reason? }` rather than throwing on failure. The caller (`trade-executor.ts`) maps status to timeline events.

*Rationale*: A thrown exception propagates to the 60s cron loop and stops all agent runs for that tick. A structured result lets the cron continue, record a `trade_failed` event, and proceed to attestation.

*Alternative considered*: wrapping the call in try/catch in `trade-executor.ts` — rejected because it scatters error-shape logic across two files.

**D2 — Polling loop for `pending_confirmation` with configurable timeout**
After the initial swap request, the RealClaw API may return `pending_confirmation` (Privy awaiting user/agent wallet sign-off). The executor polls at a 2s interval up to a configurable `REALCLAW_CONFIRM_TIMEOUT_MS` (default 30 000 ms). On timeout it returns `{ status: 'pending_confirmation', reason: 'timeout' }`.

*Rationale*: 30s fits within the 60s cron tick; a configurable env var lets it be tightened for tests and extended for slow networks.

**D3 — Retry only on transient errors (5xx / network), not 4xx**
Up to 3 retries with exponential backoff (1s, 2s, 4s) for HTTP 5xx or fetch-level network errors. No retry for 4xx (client errors: bad params, insufficient balance, slippage exceeded) — retrying these wastes time and could double-spend.

*Rationale*: Matches the retry pattern already used in `packages/mantle-data/src/client.ts`.

**D4 — `isRealClawConfigured()` validates both `REALCLAW_API_KEY` and `REALCLAW_API_BASE`**
Both env vars are required. The function logs a structured warning listing which vars are missing. A startup check in `agent-cron.ts` calls this at boot so misconfiguration is visible immediately, not at first trade.

*Rationale*: Matches the fail-loud pattern in `apps/api/src/lib/chains.ts` for Mantle addresses.

**D5 — API schema documented in `docs/REALCLAW_API.md`**
The confirmed endpoint paths, auth scheme, skill name, and example payloads are documented in a dedicated file rather than inline comments. This gives judges a readable reference and makes future schema updates localised.

**D6 — `trade_skipped` timeline event for unconfigured RealClaw on Mantle**
When `isRealClawConfigured()` is false and a Mantle trade is requested, `trade-executor.ts` emits a `trade_skipped` timeline event with `reason: 'RealClaw not configured'` and returns without attempting the trade. No silent failure.

*Rationale*: Silent failures are the root cause of the current scaffold being undetectable in production logs.

## Risks / Trade-offs

- **[API schema unknown at design time]** → The exact RealClaw skill name, payload keys, and response shape must be confirmed from `openclaw.mantle.xyz` docs or the `byreal-agent-skills` repo before implementation. If the live API differs from the scaffold's assumptions, the implementation task must adjust accordingly. Mitigation: treat step 1 of tasks as a blocking research task; do not proceed to implementation until schema is confirmed and documented.
- **[Privy confirmation UX]** → Agents run autonomously; if Privy requires an out-of-band human confirmation step (e.g. mobile push), the polling loop will always timeout. Mitigation: confirm with RealClaw docs whether server-wallet / agent wallet flows are fully autonomous; if not, surface as a known limitation in `REALCLAW_API.md`.
- **[Testnet liquidity]** → Mantle Sepolia testnet DEX liquidity may be thin or zero for some pairs. Mitigation: use mUSDC ↔ mWMNT as the E2E test pair; document required testnet token balance in the manual test guide.
- **[30s polling within 60s cron]** → The confirmation timeout of 30s leaves only 30s for the rest of the agent run. Mitigation: default to 20s polling timeout so the cron tick has comfortable headroom.

## Migration Plan

1. Confirm and document RealClaw API schema (`docs/REALCLAW_API.md`).
2. Implement `realclaw-executor.ts` with unit tests passing locally.
3. Extend `trade-executor.test.ts` — all tests green.
4. Deploy to Mantle Sepolia with testnet credentials; run one manual agent cycle; verify tx hash in explorer.
5. Update `CLAUDE.md` to remove scaffold status note.

**Rollback**: The wiring in `trade-executor.ts` is gated on `isRealClawConfigured()`. Setting `REALCLAW_API_KEY=` (empty) reverts to the `trade_skipped` fallback with zero code changes.

## Open Questions

- **Skill name**: Is it `'dex-swap'`, `'swap'`, or something else in the live Byreal Skills CLI?
- **Auth scheme**: Bearer token (current scaffold) or agent identity signature (ERC-8004)?
- **Privy server-wallet flow**: Does a Privy-managed server wallet require any additional confirmation step, or is it fully autonomous once the API key is valid?
- **`amountOut` field**: Does RealClaw return `amountOut` synchronously in the swap response, or only after on-chain confirmation?
