## ADDED Requirements

### Requirement: On-chain swap quote
The system SHALL provide `getUniswapQuote({ tokenIn, tokenOut, amountIn })` that returns the expected output amount and swap path by calling the deployed router's `getAmountsOut`, returning `null` when no pool/path exists.

#### Scenario: Direct pair quote
- **WHEN** `getUniswapQuote` is called for a token pair with a seeded direct pool
- **THEN** it returns `{ amountOut, path: [tokenIn, tokenOut] }` from `getAmountsOut`

#### Scenario: WMNT-bridged quote
- **WHEN** there is no direct pool but pools exist via WMNT
- **THEN** the quote uses the path `[tokenIn, WMNT, tokenOut]` and returns the bridged output amount

#### Scenario: No pool available
- **WHEN** no direct or WMNT-bridged path exists for the pair
- **THEN** the function returns `null` without throwing

### Requirement: Relayer-executed swap
The system SHALL execute swaps via `executeUniswapSwap({ tokenIn, tokenOut, amountIn, slippageBps })` using the relayer: ensure ERC20 allowance, compute `amountOutMin` from the quote and `slippageBps`, and submit `swapExactTokensForTokens` through `sendRelayerTransaction`, returning the on-chain `txHash`.

#### Scenario: Successful swap
- **WHEN** `executeUniswapSwap` is called for a pair with sufficient liquidity and an acceptable slippage
- **THEN** the relayer approves (if needed) and swaps, and the function returns `{ txHash, amountIn, amountOut }` with a real on-chain transaction hash

#### Scenario: Slippage protection
- **WHEN** the realized output would fall below `amountOutMin` derived from `slippageBps`
- **THEN** the swap transaction reverts and the failure is surfaced as a slippage failure category

#### Scenario: Allowance ensured once
- **WHEN** the router already has sufficient allowance for `tokenIn`
- **THEN** no redundant approval transaction is sent before the swap

### Requirement: Agent trade loop emits real execution outcomes
The system SHALL route agent-driven trades and manual swaps through the on-chain swap path and emit `trade_executed` with the real `txHash` on success; `trade_skipped` SHALL be emitted only when the DEX is not configured.

#### Scenario: Agent trade executes
- **WHEN** the agent loop validates a buy/sell signal and the DEX is configured
- **THEN** the trade is executed on-chain and a `trade_executed` timeline event is recorded with the transaction hash

#### Scenario: DEX not configured
- **WHEN** the DEX router/factory env vars are unset
- **THEN** the trade is recorded as `trade_skipped` with a clear reason and the loop does not crash

#### Scenario: Token decimals honored
- **WHEN** computing input amounts for tokens with non-18 decimals (e.g. mUSDC 6-dec)
- **THEN** amounts are scaled using the token's actual decimals, not a hardcoded 1e18

### Requirement: RealClaw execution removed
The system SHALL NOT depend on RealClaw for execution. `realclaw-executor.ts` and the `REALCLAW_API_KEY` / `REALCLAW_API_BASE` env vars and their startup warning are removed.

#### Scenario: No RealClaw references remain
- **WHEN** the API starts and the trade path is exercised
- **THEN** no RealClaw module is imported and no missing-`REALCLAW_*`-env warning is logged
