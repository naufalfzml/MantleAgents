## 1. DEX contracts

- [x] 1.1 Add Uniswap V2 contracts to `packages/contracts/contracts/`: `UniswapV2Factory.sol`, `UniswapV2Pair.sol`, `UniswapV2Router02.sol`, `WETH9.sol` (WMNT), and required libraries/interfaces (use a solc 0.8-compatible port or pin the V2 solc version in `compile.ts`)
- [x] 1.2 Update `packages/contracts/scripts/compile.ts` to compile the new contracts (handle their solc version + library linking)
- [x] 1.3 Verify `pnpm --filter @mantleagents/contracts` compile succeeds and produces ABIs/bytecode

## 2. Deploy & seed

- [x] 2.1 Create `packages/contracts/scripts/deploy-dex.ts`: deploy WETH9/WMNT, Factory, Router02(factory, WMNT) via viem using the relayer key
- [x] 2.2 In the script, for each configured pair (mUSDC/mWMNT, mUSDT/mWMNT, mUSDC/mUSDT): call mock `faucet()`, `approve` router, `addLiquidity` (scaled by each token's decimals) to create + seed pools
- [x] 2.3 Print `MANTLE_DEX_ROUTER_ADDRESS` and `MANTLE_DEX_FACTORY_ADDRESS` and a relayer-funding reminder; add a `deploy:dex` script to `packages/contracts/package.json`
- [x] 2.4 Run `deploy:dex` against Mantle Sepolia; confirm `getPair` non-zero + non-zero reserves; record addresses

## 3. Config wiring

- [x] 3.1 Add `getMantleDexRouterAddress()` and `getMantleDexFactoryAddress()` to `apps/api/src/lib/chains.ts` (read env, throw if unset)
- [x] 3.2 Add `MANTLE_DEX_ROUTER_ADDRESS` / `MANTLE_DEX_FACTORY_ADDRESS` to `apps/api/.env` and `.env.example`; remove `REALCLAW_API_KEY` / `REALCLAW_API_BASE`

## 4. Swap service

- [x] 4.1 Implement `getUniswapQuote({ tokenIn, tokenOut, amountIn })` in `apps/api/src/services/uniswap-swap.ts` using router `getAmountsOut` via the shared public client; direct path with WMNT-bridged fallback; return `null` when no path
- [x] 4.2 Implement `executeUniswapSwap({ tokenIn, tokenOut, amountIn, slippageBps })`: ensure allowance, compute `amountOutMin`, encode + send `swapExactTokensForTokens` via `sendRelayerTransaction`; return `{ txHash, amountIn, amountOut }`
- [x] 4.3 Remove the dead `serverWalletId`/`serverWalletAddress` params; relayer is signer + recipient

## 5. Rewire executor

- [x] 5.1 Update `trade-executor.ts` `executeMantle()` to use `getUniswapQuote` + `executeUniswapSwap` instead of RealClaw; emit `trade_executed` with real `txHash`; map failures via `mapFailureCategory`; `trade_skipped` only when DEX env unset
- [x] 5.2 Update `executeSwap()` (manual swaps) to route through the same DEX path
- [x] 5.3 Scale token amounts with `getTokenDecimals` (replace hardcoded `1e18`)
- [x] 5.4 Delete `apps/api/src/services/realclaw-executor.ts` and remove its imports + the `isRealClawConfigured` startup warning

## 6. Un-stub routes & convert

- [x] 6.1 Implement `POST /api/trade/quote` in `routes/trade.ts` via `getUniswapQuote` (replace 501)
- [x] 6.2 Implement `GET /api/trade/balance` via ERC20 `balanceOf` through `chain-client` (replace 501)
- [x] 6.3 Implement `convertWalletToUsdc` in `convert-to-usdc.ts`: swap non-USDC mock balances → mUSDC via `executeUniswapSwap`; return swapped/skipped

## 7. Verify

- [x] 7.1 `pnpm type-check` passes
- [ ] 7.2 Update/extend tests: `uniswap-swap` quote/execute (mock public client + relayer), `trade-executor` emits `trade_executed`; `pnpm --filter @mantleagents/api test` green
- [ ] 7.3 Manual: trigger an agent run → confirm `trade_executed` + tx visible on mantlescan + attestation committed; hit `/api/trade/quote` and `/api/trade/balance`
- [x] 7.4 Update `docs/E2E_TESTING.md` (trade flow now executes, remove `trade_skipped` known-limitation), `CLAUDE.md`, `README.md`, `apps/api/.env.example`
