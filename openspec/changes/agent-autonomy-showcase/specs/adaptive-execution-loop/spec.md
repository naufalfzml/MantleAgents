## ADDED Requirements

### Requirement: agent-cron executes a plan→execute→observe→adapt loop per tick
For each agent run tick, `agent-cron.ts` SHALL follow the sequence: plan (LLM signal + guardrail check) → execute → observe (inspect `TradeResult.success` and `failureCategory`) → adapt (call `evaluateAdaptedPlan` if failed) → execute adapted plan (if non-null). The loop MUST cap at 1 adaptation per tick.

#### Scenario: Successful first attempt — no adaptation
- **WHEN** the initial `executeTrade` returns `success: true`
- **THEN** no `evaluateAdaptedPlan` call MUST be made and no `decision_adapted` event MUST be emitted

#### Scenario: Failed first attempt — adaptation attempted once
- **WHEN** the initial `executeTrade` returns `success: false`
- **THEN** `evaluateAdaptedPlan` MUST be called exactly once and `decision_adapted` MUST be emitted

#### Scenario: Adapted execution also fails — loop terminates
- **WHEN** both the initial and the adapted `executeTrade` return `success: false`
- **THEN** the tick MUST end with a `trade_failed` event and MUST NOT attempt a third execution

### Requirement: Hard cap of 1 adaptation per tick enforced by explicit constant
The maximum number of adaptations per tick SHALL be enforced by a named constant `MAX_ADAPTATIONS_PER_TICK = 1` exported from `packages/shared`. `agent-cron.ts` MUST reference this constant rather than an inline magic number.

#### Scenario: Constant enforces loop exit
- **WHEN** a test mocks `executeTrade` to always fail and `evaluateAdaptedPlan` to always return a non-null plan
- **THEN** the loop MUST exit after exactly `MAX_ADAPTATIONS_PER_TICK` adapted attempts, never more

### Requirement: decision_adapted event emitted for every adaptation decision
Immediately after `evaluateAdaptedPlan` returns (whether null or non-null), `agent-cron.ts` SHALL insert a `decision_adapted` timeline event with `summary = JSON.stringify({ originalPlan, reason, adaptedPlan })`. The event MUST be inserted before any adapted execution attempt.

#### Scenario: decision_adapted emitted when adapted plan is non-null
- **WHEN** `evaluateAdaptedPlan` returns a non-null `AdaptedPlan`
- **THEN** a `decision_adapted` event MUST appear in the timeline before the subsequent trade event

#### Scenario: decision_adapted emitted even when adapted plan is null
- **WHEN** `evaluateAdaptedPlan` returns `null`
- **THEN** a `decision_adapted` event with `adaptedPlan: null` in its summary MUST still be emitted and no additional execution MUST occur

#### Scenario: decision_adapted timestamp precedes adapted trade event
- **WHEN** adaptation succeeds and the adapted trade also succeeds
- **THEN** the `decision_adapted` event's `created_at` MUST be earlier than the subsequent `trade` event in the same run

### Requirement: Slippage scenario produces observable timeline sequence
When slippage causes the first trade to fail and adaptation reduces the amount, the timeline SHALL contain the full decision trail in order.

#### Scenario: Timeline sequence for slippage recovery
- **WHEN** the first execution fails with `failureCategory: 'slippage_exceeded'` and the adapted execution succeeds
- **THEN** the timeline MUST contain in order: `decision_input` → `trade_failed` → `decision_adapted` → `trade`

### Requirement: Risk-flag scenario produces observable timeline sequence
When a risk flag causes the first trade to be cancelled, the timeline SHALL record the abort.

#### Scenario: Timeline sequence for risk-flag abort
- **WHEN** the first execution fails with `failureCategory: 'risk_flagged'` and no watchlist alternative is available
- **THEN** the timeline MUST contain: `decision_input` → `trade_failed` → `decision_adapted (adaptedPlan: null)` with no subsequent trade event in that run

### Requirement: Guardrail remains the final authority on adapted plans
No adaptation produced by `evaluateAdaptedPlan` and executed by `agent-cron.ts` SHALL violate any guardrail constraint (`maxValuePerTx`, daily limit, etc.). If `evaluateAdaptedPlan` returns a plan, it is already guardrail-checked; `agent-cron.ts` MUST NOT execute a plan without going through `evaluateAdaptedPlan`.

#### Scenario: Adaptation never bypasses maxValuePerTx
- **WHEN** an adapted plan is executed
- **THEN** `adaptedSignal.amountUsd` MUST be less than or equal to the agent's `maxValuePerTx` guardrail
