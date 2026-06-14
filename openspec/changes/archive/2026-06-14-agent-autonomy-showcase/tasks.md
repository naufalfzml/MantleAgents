## 1. Shared Types

- [x] 1.1 Add `FailureCategory` type (`'slippage_exceeded' | 'risk_flagged' | 'insufficient_funds' | 'other'`) to `packages/shared`
- [x] 1.2 Add `AdaptedPlan` interface (`{ originalSignal, adaptedSignal, reason, strategy }`) to `packages/shared`
- [x] 1.3 Add `'decision_adapted'` to the timeline event type discriminant in `packages/shared`
- [x] 1.4 Export `MAX_ADAPTATIONS_PER_TICK = 1` constant from `packages/shared`
- [x] 1.5 Run `pnpm type-check` from root — exit 0

## 2. TradeResult Discriminated Union

- [x] 2.1 Rewrite `TradeResult` in `trade-executor.ts` as a discriminated union with `success: true` and `success: false` variants
- [x] 2.2 Update `executeTrade`: catch all internal throw paths and map them to the failure variant with correct `failureCategory`
- [x] 2.3 Update `executeSwap`: same — return failure variant instead of throwing
- [x] 2.4 Map RealClaw result statuses to `FailureCategory` inside `trade-executor.ts` (slippage keywords → `'slippage_exceeded'`; risk → `'risk_flagged'`; balance → `'insufficient_funds'`; everything else → `'other'`)
- [x] 2.5 Find all callers of `executeTrade` / `executeSwap` in the codebase (`grep -r "executeTrade\|executeSwap" apps/ packages/`) and update each to check `result.success` instead of relying on throw
- [x] 2.6 Run `pnpm type-check` — exit 0

## 3. evaluateAdaptedPlan in rules-engine

- [x] 3.1 Add `evaluateAdaptedPlan(originalSignal, failureCategory, config, watchlistCandidates)` function to `rules-engine.ts`
- [x] 3.2 Implement `'slippage_exceeded'` strategy: set `adaptedSignal.amountUsd = originalSignal.amountUsd * 0.5`; validate result against guardrails; return `null` if below minimum or above limit
- [x] 3.3 Implement `'risk_flagged'` strategy: if `watchlistCandidates` is empty → return `null`; else find first non-risk-flagged candidate that passes guardrails → return plan with `strategy: 'alternative_token'`; if none found → return `null`
- [x] 3.4 Implement `'other'` and `'insufficient_funds'` strategies: return `null` immediately
- [x] 3.5 Ensure guardrail re-evaluation (`evaluateSignal` or equivalent) is called on the adapted plan before returning a non-null result

## 4. Adaptive Loop in agent-cron

- [x] 4.1 Restructure the execution section of `agent-cron.ts` into a plan→execute→observe→adapt sequence
- [x] 4.2 Declare `let adaptationCount = 0` loop variable; import `MAX_ADAPTATIONS_PER_TICK` from `packages/shared`
- [x] 4.3 After a failed `executeTrade`, call `evaluateAdaptedPlan` and emit `decision_adapted` timeline event (regardless of whether plan is null or non-null)
- [x] 4.4 If `adaptedPlan` is non-null and `adaptationCount < MAX_ADAPTATIONS_PER_TICK`, execute the adapted plan and increment `adaptationCount`
- [x] 4.5 Ensure the loop exits after `MAX_ADAPTATIONS_PER_TICK` adaptations — no further execution attempted
- [x] 4.6 Ensure `decision_adapted` event timestamp precedes any subsequent trade event within the same run

## 5. Unit Tests — rules-engine

- [x] 5.1 Extend `rules-engine.test.ts`: `evaluateAdaptedPlan` with `'slippage_exceeded'` → returns plan with 50% `amountUsd`, within guardrail
- [x] 5.2 Test: `'slippage_exceeded'` where halved amount is still above `maxValuePerTx` → returns `null`
- [x] 5.3 Test: `'slippage_exceeded'` where halved amount is below minimum threshold → returns `null`
- [x] 5.4 Test: `'risk_flagged'` with empty watchlist → returns `null`
- [x] 5.5 Test: `'risk_flagged'` with one clean candidate → returns plan with `strategy: 'alternative_token'`
- [x] 5.6 Test: `'risk_flagged'` with all candidates flagged → returns `null`
- [x] 5.7 Test: `'other'` → returns `null`
- [x] 5.8 Run `cd apps/api && pnpm vitest run src/services/rules-engine.test.ts` — all green

## 6. Unit Tests — agent-cron

- [x] 6.1 Extend `agent-cron.test.ts`: mock `executeTrade` returns `slippage_exceeded` on attempt 1, `success` on attempt 2 → `decision_adapted` emitted; exactly 1 retry; no third call
- [x] 6.2 Test: mock `executeTrade` always returns `slippage_exceeded` → after 1 retry loop exits with `trade_failed`; no infinite loop
- [x] 6.3 Test: mock `failureCategory: 'risk_flagged'` with empty watchlist → `decision_adapted` with `adaptedPlan: null` emitted; no additional `executeTrade` call
- [x] 6.4 Test: successful first attempt → no `decision_adapted` event; no `evaluateAdaptedPlan` call
- [x] 6.5 Run `cd apps/api && pnpm vitest run src/services/agent-cron.test.ts` — all green

## 7. Manual Demo Verification

- [ ] 7.1 **Slippage scenario**: configure agent with tight `maxSlippageBps`; trigger a run; verify timeline order: `decision_input` → `trade_failed` → `decision_adapted` → `trade`
- [ ] 7.2 **Risk-flag scenario**: add a dummy high-risk token to watchlist or mock risk-check response; trigger a run; verify timeline: `decision_input` → `trade_failed` → `decision_adapted (adaptedPlan: null)`
- [ ] 7.3 Cross-check with attestation: confirm `decision_adapted` event appears in the `eventsHash` of the run's attestation

## 8. Cleanup

- [x] 8.1 Run `pnpm type-check` from repo root — exit 0
- [x] 8.2 Run `pnpm --filter @mantleagents/web build` — exit 0 (no frontend regressions from shared type changes)
