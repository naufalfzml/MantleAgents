## ADDED Requirements

### Requirement: TradeResult is a discriminated union with a success flag
`TradeResult` SHALL be a discriminated union: the success variant carries `{ success: true, txHash, amountIn, amountOut, rate }` and the failure variant carries `{ success: false, failureCategory: FailureCategory, reason: string }`. `executeTrade` and `executeSwap` MUST NOT throw on trade-level failures — they SHALL return the failure variant instead.

#### Scenario: Successful trade returns success variant
- **WHEN** `executeTrade` completes a swap and receives a valid tx hash
- **THEN** the return value MUST have `success: true` and include non-empty `txHash`, `amountIn`, `amountOut`, and `rate`

#### Scenario: Slippage failure returns structured failure variant
- **WHEN** the underlying executor (RealClaw or AVE) returns a slippage-related error
- **THEN** `executeTrade` MUST return `{ success: false, failureCategory: 'slippage_exceeded', reason: string }` without throwing

#### Scenario: Risk-flagged failure returns structured failure variant
- **WHEN** a risk check (GoPlus / contract simulation) flags the target token before or during execution
- **THEN** `executeTrade` MUST return `{ success: false, failureCategory: 'risk_flagged', reason: string }` without throwing

#### Scenario: Insufficient funds returns structured failure variant
- **WHEN** the executor returns an insufficient-balance error
- **THEN** `executeTrade` MUST return `{ success: false, failureCategory: 'insufficient_funds', reason: string }` without throwing

#### Scenario: Unknown errors map to 'other' category
- **WHEN** an unexpected error occurs that does not match a known category
- **THEN** `executeTrade` MUST return `{ success: false, failureCategory: 'other', reason: string }` without throwing

### Requirement: FailureCategory and AdaptedPlan types exported from packages/shared
`FailureCategory` (`'slippage_exceeded' | 'risk_flagged' | 'insufficient_funds' | 'other'`) and `AdaptedPlan` SHALL be exported from `packages/shared` so all packages can import them without circular dependencies.

#### Scenario: FailureCategory importable from shared
- **WHEN** `import type { FailureCategory } from '@jakartagents/shared'` is used in any app or package
- **THEN** TypeScript compilation MUST succeed with no type errors

### Requirement: RealClaw result status maps to FailureCategory in trade-executor
`trade-executor.ts` SHALL map `RealClawSwapResult.status` values to `FailureCategory` before returning `TradeResult`, so no caller ever needs to inspect RealClaw-specific status strings.

#### Scenario: RealClaw 'failed' status with slippage reason maps to slippage_exceeded
- **WHEN** `executeRealClawSwap` returns `{ status: 'failed', reason: '..slippage..' }`
- **THEN** `executeTrade` MUST return `{ success: false, failureCategory: 'slippage_exceeded', reason }`

#### Scenario: RealClaw 'error' status maps to 'other'
- **WHEN** `executeRealClawSwap` returns `{ status: 'error', reason }`
- **THEN** `executeTrade` MUST return `{ success: false, failureCategory: 'other', reason }`
