## ADDED Requirements

### Requirement: executeRealClawSwap returns structured result for successful swap
`executeRealClawSwap()` SHALL call the live RealClaw API with the correct skill name, payload, and auth header, and on success return `{ status: 'success', txHash: string, amountOut: string }`.

#### Scenario: Successful swap on Mantle Sepolia
- **WHEN** `executeRealClawSwap` is called with valid `tokenIn`, `tokenOut`, `amountIn`, `walletAddress`, and `slippageBps`, and the RealClaw API responds with a confirmed transaction
- **THEN** the function MUST return `{ status: 'success', txHash: '<0x...>', amountOut: '<string>' }` with no exception thrown

#### Scenario: txHash is a valid transaction hash
- **WHEN** `executeRealClawSwap` returns `status: 'success'`
- **THEN** `txHash` MUST be a non-empty string starting with `0x`

### Requirement: executeRealClawSwap handles Privy pending_confirmation polling
When the RealClaw API returns a `pending_confirmation` state, `executeRealClawSwap()` SHALL poll at 2-second intervals until the transaction is confirmed or the timeout (default 20 000 ms, configurable via `REALCLAW_CONFIRM_TIMEOUT_MS`) is exceeded.

#### Scenario: Confirmation received before timeout
- **WHEN** the first API response is `pending_confirmation` and a subsequent poll returns `success`
- **THEN** the function MUST return `{ status: 'success', txHash, amountOut }` without error

#### Scenario: Confirmation timeout exceeded
- **WHEN** the API continues returning `pending_confirmation` for longer than `REALCLAW_CONFIRM_TIMEOUT_MS`
- **THEN** the function MUST return `{ status: 'pending_confirmation', reason: 'timeout' }` and MUST NOT throw

### Requirement: executeRealClawSwap maps 4xx errors to failed status without retry
When the RealClaw API returns an HTTP 4xx response, `executeRealClawSwap()` SHALL return `{ status: 'failed', reason: string }` immediately with no retry attempts.

#### Scenario: Insufficient balance (4xx)
- **WHEN** the RealClaw API returns HTTP 400 with an "insufficient balance" error body
- **THEN** the function MUST return `{ status: 'failed', reason: 'insufficient balance' }` with zero retries

#### Scenario: Slippage exceeded (4xx)
- **WHEN** the RealClaw API returns HTTP 400 with a slippage error body
- **THEN** the function MUST return `{ status: 'failed', reason: '<slippage error text>' }` with zero retries

### Requirement: executeRealClawSwap retries on 5xx and network errors
For HTTP 5xx responses or fetch-level network errors, `executeRealClawSwap()` SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s). After all retries are exhausted it SHALL return `{ status: 'error', reason: string }`.

#### Scenario: Transient 5xx resolved by retry
- **WHEN** the first two calls return HTTP 503 and the third returns success
- **THEN** the function MUST return `{ status: 'success', txHash, amountOut }`

#### Scenario: All retries exhausted on 5xx
- **WHEN** all three calls return HTTP 503
- **THEN** the function MUST return `{ status: 'error', reason: '<last error message>' }` and MUST NOT throw

### Requirement: trade-executor routes Mantle trades to RealClaw when configured
When `isRealClawConfigured()` returns true and `executeTrade()` or `executeSwap()` is called for chain Mantle, `trade-executor.ts` SHALL invoke `executeRealClawSwap()` and map its result to the appropriate timeline event.

#### Scenario: Successful Mantle trade emits trade event
- **WHEN** `executeTrade` is called for chain Mantle, `isRealClawConfigured()` is true, and `executeRealClawSwap` returns `status: 'success'`
- **THEN** a `trade` timeline event MUST be emitted with `tx_hash` populated

#### Scenario: Failed Mantle trade emits trade_failed event
- **WHEN** `executeRealClawSwap` returns `status: 'failed'` or `status: 'error'`
- **THEN** a `trade_failed` timeline event MUST be emitted with `reason` populated, and the function MUST NOT throw

#### Scenario: Pending Mantle trade emits trade_pending event
- **WHEN** `executeRealClawSwap` returns `status: 'pending_confirmation'`
- **THEN** a `trade_pending` timeline event MUST be emitted with `reason` populated

### Requirement: trade-executor emits trade_skipped when RealClaw is not configured
When `isRealClawConfigured()` returns false and a Mantle trade is requested, `trade-executor.ts` SHALL emit a `trade_skipped` timeline event with `reason: 'RealClaw not configured'` and MUST NOT silently do nothing.

#### Scenario: RealClaw unconfigured — no silent failure
- **WHEN** `executeTrade` is called for chain Mantle and `isRealClawConfigured()` returns false
- **THEN** a `trade_skipped` event MUST be emitted with `reason: 'RealClaw not configured'`, and the function MUST return without throwing
