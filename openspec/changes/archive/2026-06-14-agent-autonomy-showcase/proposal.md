## Why

"Agent autonomy" is the second-highest judging criterion in the Agentic Economy track (14/50 points), and the current agent loop is entirely linear and single-shot: if a trade fails, the agent logs the error and waits until the next 60-second tick with no corrective action. This scores poorly on the "adaptive execution / autonomous error recovery" dimension judges are explicitly looking for. Adding a structured observe → adapt cycle within each tick demonstrates genuine agentic behaviour without scope-creeping into multi-agent coordination.

## What Changes

- Add `failureCategory: 'slippage_exceeded' | 'risk_flagged' | 'insufficient_funds' | 'other'` to `TradeResult` (and the RealClaw result union) so callers can branch on structured failure reason rather than parsing error strings.
- Add `evaluateAdaptedPlan(originalSignal, failureCategory, guardrails, watchlist)` to `rules-engine.ts` — returns an `AdaptedPlan` or `null` when no valid corrective action exists within guardrails.
- Change `agent-cron.ts` execution flow from linear to **plan → execute → observe → adapt** with a hard cap of 1 adaptation per tick.
- Add `decision_adapted` timeline event type carrying `{ originalPlan, reason, adaptedPlan }` emitted at every adaptation decision (including when `adaptedPlan` is null, i.e. agent chose to abort).
- Add shared types `FailureCategory`, `AdaptedPlan`, and `decision_adapted` event discriminant to `packages/shared`.
- Two concrete adaptation strategies: (1) slippage exceeded → retry with 50% `amountIn` within guardrail limits; (2) risk flagged → cancel trade, log reason, optionally try next watchlist candidate.

## Capabilities

### New Capabilities

- `adaptive-execution-loop`: A plan→execute→observe→adapt loop in `agent-cron.ts` capped at 1 adaptation per tick, with structured failure routing and `decision_adapted` timeline events.
- `guardrail-adapted-plan-evaluation`: `evaluateAdaptedPlan()` in `rules-engine.ts` that produces a corrective plan (or null) for a given failure category, always within guardrail constraints.
- `structured-trade-failure`: `failureCategory` discriminant on `TradeResult` and `RealClawSwapResult` enabling typed adaptation logic instead of string parsing.

### Modified Capabilities

*(none — no existing spec-level behaviour changes)*

## Impact

- `packages/shared` — new types `FailureCategory`, `AdaptedPlan`; `decision_adapted` event type
- `apps/api/src/services/trade-executor.ts` — `TradeResult` gains `success: boolean` + `failureCategory`
- `apps/api/src/services/realclaw-executor.ts` — result union already has `status` discriminant; ensure `failureCategory` is mapped from it
- `apps/api/src/services/rules-engine.ts` — new `evaluateAdaptedPlan` function
- `apps/api/src/services/agent-cron.ts` — execution loop restructured; `decision_adapted` events emitted
- `apps/api/src/services/rules-engine.test.ts` — extended with adapted-plan tests
- `apps/api/src/services/agent-cron.test.ts` — extended with adaptive loop tests
- No changes to attestation schema (the new event type is automatically included in `eventsHash` via existing `hashEvents`)
