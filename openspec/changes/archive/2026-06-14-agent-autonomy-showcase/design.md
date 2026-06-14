## Context

The 60-second `agent-cron.ts` tick currently runs: fetch positions → fetch market data → LLM signal → guardrail check → execute trade → log. If execution fails, the cron emits a `trade_failed` event and terminates that tick. The next run starts fresh from scratch — there is no memory of what failed or why.

`TradeResult` today only has success fields (`txHash`, `amountIn`, `amountOut`, `rate`); the executor throws on failure, and the cron catches it. This means failure reason is a string in an exception message — impossible to branch on cleanly.

`rules-engine.ts` exposes `evaluateSignal(signal, config, positions, market)` returning `GuardrailCheck`. It validates once before execution and is never consulted again. There is no re-evaluation path for corrective actions.

The goal is to add a single, bounded observe→adapt cycle to each tick that leaves the overall architecture intact while demonstrating genuine adaptive reasoning.

## Goals / Non-Goals

**Goals:**
- Structured `failureCategory` on trade results enabling typed adaptation logic.
- `evaluateAdaptedPlan()` that produces a guardrail-checked corrective plan or null.
- A plan→execute→observe→adapt loop in `agent-cron.ts` with a hard 1-adaptation cap per tick.
- Two concrete strategies: slippage→reduce amount; risk-flag→abort (+ optional watchlist fallback).
- `decision_adapted` event emitted for every adaptation decision.

**Non-Goals:**
- Multi-step reasoning chains or tool-calling loops within a single tick (out of scope for hackathon).
- Multi-agent coordination.
- Changing the attestation payload schema (handled by change `onchain-decision-attestation`).
- Adding adaptation strategies beyond the two specified (leave extension points but don't implement).

## Decisions

**D1 — `TradeResult` becomes a discriminated union with `success` flag**
Change `TradeResult` from a pure-success interface to:
```ts
type TradeResult =
  | { success: true; txHash: string; amountIn: string; amountOut: string; rate: number }
  | { success: false; failureCategory: FailureCategory; reason: string }
```
`executeTrade` / `executeSwap` catch internal errors and map them to the failure variant instead of throwing. Callers use `result.success` as the discriminant.

*Alternative*: Keep throwing + wrap at callsite. Rejected because it requires every caller to parse exception messages, which is brittle and hard to test.

**D2 — `FailureCategory` is a string literal union defined in `packages/shared`**
```ts
type FailureCategory = 'slippage_exceeded' | 'risk_flagged' | 'insufficient_funds' | 'other'
```
Mapping from RealClaw result status and legacy error strings happens inside `trade-executor.ts` so the cron never sees raw strings.

**D3 — `evaluateAdaptedPlan` is a pure function in `rules-engine.ts`**
Signature: `evaluateAdaptedPlan(originalSignal: Signal, failureCategory: FailureCategory, config: AgentConfigForRules, watchlistCandidates: Token[]): AdaptedPlan | null`

It returns `null` when no valid adaptation exists (guardrail would be violated, no alternative tokens, or category is `'other'`). It always runs guardrail checks on the adapted plan before returning it — adapting never bypasses guardrails.

*Alternative*: Put adaptation logic in `agent-cron.ts` directly. Rejected because rules-engine is the guardrail authority; placing adapted-plan evaluation there keeps guardrail enforcement centralised and testable in isolation.

**D4 — Hard 1-adaptation cap implemented as a loop variable, not a recursion guard**
```ts
let adaptationCount = 0;
const MAX_ADAPTATIONS = 1;
```
The loop exits when `adaptationCount >= MAX_ADAPTATIONS` or `adaptedPlan === null` or `result.success`. This is explicit, easy to test, and readable in code review. The constant is exported from `packages/shared` so tests can verify it.

**D5 — `decision_adapted` event written before the adapted execution attempt**
The event is written immediately after `evaluateAdaptedPlan` returns (whether plan is non-null or null), before any retry execution. This ensures the timeline captures the reasoning even if the adapted execution also fails.

**D6 — `AdaptedPlan` carries `originalPlan` reference for attestation compatibility**
```ts
interface AdaptedPlan {
  originalSignal: Signal;
  adaptedSignal: Signal;          // e.g. same action, smaller amountUsd
  reason: string;                  // human-readable
  strategy: 'reduce_amount' | 'alternative_token' | 'abort'
}
```
The `decision_adapted` event's `summary` is `JSON.stringify({ originalPlan, reason, adaptedPlan })`, matching the format expected by `computeDecisionHash` from change `onchain-decision-attestation`.

## Risks / Trade-offs

- **[TradeResult interface is a breaking change]** → All callers of `executeTrade` / `executeSwap` must be updated to check `result.success`. Mitigation: grep all callers before starting; list is small (agent-cron, any test files, API route handlers for `/trade` and `/swap`).
- **[Adapted execution might also fail]** → The adapted plan runs once; if it also fails, the tick ends with `trade_failed`. This is correct and explicit — no silent retry escalation.
- **[Watchlist candidate selection]** → The risk-flag strategy optionally tries the next watchlist token. If the watchlist is empty or all candidates are also risk-flagged, `evaluateAdaptedPlan` returns `null`. This must be handled gracefully (emit `decision_adapted` with `adaptedPlan: null`).
- **[Increased tick duration]** → A tick with one adaptation takes up to 2× the execution time. The 60s interval gives headroom, but if both executions are slow (e.g. Privy confirmation polling from RealClaw), the tick might run long. Mitigation: the `REALCLAW_CONFIRM_TIMEOUT_MS` from change `realclaw-execution-live` already bounds execution time; total tick budget is still well within 60s.
