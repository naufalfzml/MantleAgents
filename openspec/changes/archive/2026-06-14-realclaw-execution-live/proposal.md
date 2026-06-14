## Why

The Byreal integration is the highest-weighted judging criterion in the Agentic Economy track (18/50 points), yet the current `executeRealClawSwap()` is an interface-only scaffold with a hard `throw` and multiple `TODO` comments — meaning no on-chain swap ever actually runs via RealClaw on Mantle. Completing this turns the biggest scoring gap into a demonstrated, verifiable capability before the demo.

## What Changes

- Confirm and document the live `openclaw.mantle.xyz` API schema (endpoint paths, auth scheme, skill name, request/response shapes) in `docs/REALCLAW_API.md`.
- Implement `executeRealClawSwap()` end-to-end: real HTTP call → Privy non-custodial confirmation polling → parsed `{ status, txHash, amountOut }` result.
- Harden `isRealClawConfigured()` to validate all required env vars at startup and log a clear warning if any are missing (fail-loud, matching the pattern in `chains.ts`).
- Wire `trade-executor.ts` so that Mantle trades always route to `executeRealClawSwap()` when `isRealClawConfigured()` is true, and emit an explicit `trade_skipped` event (not a silent no-op) when it is false.
- Add retry/backoff for transient errors (network/5xx) with no retry for permanent errors (insufficient balance, slippage exceeded).
- Map all RealClaw result states to timeline events: `trade`, `trade_failed`, `trade_pending`.
- Update `CLAUDE.md` to remove the "scaffolded, pending confirmation" status note.
- Add unit tests for `realclaw-executor.ts` and extend `trade-executor.test.ts` with Mantle routing cases.

## Capabilities

### New Capabilities

- `realclaw-swap-execution`: End-to-end non-custodial swap execution on Mantle via RealClaw / Byreal Skills CLI, including Privy confirmation polling, retry logic, and timeline event mapping.
- `realclaw-config-validation`: Startup validation of all RealClaw environment variables with fail-loud logging, and a reliable `isRealClawConfigured()` guard used across the trade path.

### Modified Capabilities

*(none — trade-executor routing logic is an implementation detail change, not a spec-level behavior change for an existing spec)*

## Impact

- `apps/api/src/services/realclaw-executor.ts` — full implementation replacing the scaffold
- `apps/api/src/services/trade-executor.ts` — Mantle routing wired to RealClaw; fallback made explicit
- `apps/api/src/services/realclaw-executor.test.ts` — new test file
- `apps/api/src/services/trade-executor.test.ts` — extended with Mantle/RealClaw cases
- `docs/REALCLAW_API.md` — new API schema reference doc
- `CLAUDE.md` — status note updated
- No changes to `rules-engine.ts`, `agent-cron.ts`, or attestation logic
