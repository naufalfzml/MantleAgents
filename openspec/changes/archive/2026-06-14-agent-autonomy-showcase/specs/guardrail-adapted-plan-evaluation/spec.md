## ADDED Requirements

### Requirement: evaluateAdaptedPlan returns a guardrail-checked corrective plan or null
`evaluateAdaptedPlan(originalSignal, failureCategory, config, watchlistCandidates)` in `rules-engine.ts` SHALL return an `AdaptedPlan` when a valid corrective action exists within guardrail limits, or `null` when no valid adaptation is possible. It MUST run a full guardrail check on the adapted plan before returning it — adapting SHALL NEVER produce a plan that violates `maxValuePerTx`, daily limits, or any other active guardrail.

#### Scenario: Returns null for 'other' failure category
- **WHEN** `evaluateAdaptedPlan` is called with `failureCategory: 'other'`
- **THEN** the function MUST return `null`

#### Scenario: Adapted plan that would violate guardrails returns null
- **WHEN** the reduced `amountUsd` in an adapted plan would still exceed `maxValuePerTx`
- **THEN** `evaluateAdaptedPlan` MUST return `null` rather than an invalid plan

### Requirement: Slippage-exceeded adaptation reduces amountIn by 50%
When `failureCategory` is `'slippage_exceeded'`, `evaluateAdaptedPlan` SHALL return an `AdaptedPlan` with `adaptedSignal.amountUsd` set to 50% of `originalSignal.amountUsd`, provided the reduced amount is still above the minimum trade threshold and within guardrail limits.

#### Scenario: Slippage exceeded — adapted plan halves the amount
- **WHEN** `evaluateAdaptedPlan` is called with `failureCategory: 'slippage_exceeded'` and `originalSignal.amountUsd = 100`
- **THEN** the returned `AdaptedPlan.adaptedSignal.amountUsd` MUST equal `50`

#### Scenario: Slippage exceeded — adapted amount below minimum returns null
- **WHEN** the halved `amountUsd` is below the guardrail minimum trade threshold
- **THEN** `evaluateAdaptedPlan` MUST return `null`

#### Scenario: Slippage exceeded — adapted amount within guardrail limit
- **WHEN** the halved `amountUsd` is within `maxValuePerTx`
- **THEN** `evaluateAdaptedPlan` MUST return a non-null `AdaptedPlan` with `strategy: 'reduce_amount'`

### Requirement: Risk-flagged adaptation aborts or tries watchlist alternative
When `failureCategory` is `'risk_flagged'`, `evaluateAdaptedPlan` SHALL: if `watchlistCandidates` is empty or all candidates are also risk-flagged, return `null` with `strategy: 'abort'`; if a clean candidate exists, return an `AdaptedPlan` with `strategy: 'alternative_token'` pointing to the first non-flagged candidate that passes guardrails.

#### Scenario: Risk flagged with no watchlist candidates returns null
- **WHEN** `evaluateAdaptedPlan` is called with `failureCategory: 'risk_flagged'` and `watchlistCandidates = []`
- **THEN** the function MUST return `null`

#### Scenario: Risk flagged with a clean alternative returns adapted plan
- **WHEN** `watchlistCandidates` contains at least one token that is not risk-flagged and passes guardrails
- **THEN** `evaluateAdaptedPlan` MUST return an `AdaptedPlan` with `strategy: 'alternative_token'` referencing that token

#### Scenario: Risk flagged — all candidates also risk-flagged returns null
- **WHEN** all `watchlistCandidates` fail the risk check
- **THEN** `evaluateAdaptedPlan` MUST return `null`

### Requirement: AdaptedPlan carries originalSignal, adaptedSignal, reason, and strategy
`AdaptedPlan` SHALL contain `{ originalSignal: Signal, adaptedSignal: Signal, reason: string, strategy: 'reduce_amount' | 'alternative_token' | 'abort' }`. All fields MUST be serialisable to JSON for inclusion in `decision_adapted` timeline events.

#### Scenario: AdaptedPlan is JSON-serialisable
- **WHEN** `JSON.stringify(adaptedPlan)` is called on a returned `AdaptedPlan`
- **THEN** it MUST succeed without throwing and the result MUST be parseable back to an equivalent object
