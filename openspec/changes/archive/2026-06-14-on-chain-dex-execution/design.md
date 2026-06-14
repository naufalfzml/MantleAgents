## Context

The agent execution loop (`agent-cron.ts`) runs: positions → market data (CoinGecko) → signals (Gemini) → guardrails (rules-engine) → **execute trade** → timeline + attestation. Every step works except execution, which always yields `trade_skipped`.

Current execution code:
- `trade-executor.ts` → `executeMantle()` calls `executeRealClawSwap()` (`realclaw-executor.ts`), gated on `isRealClawConfigured()` (`REALCLAW_API_KEY` + `REALCLAW_API_BASE`). RealClaw is a closed arena product, not a developer API — never configured, always skipped. The file's own comment marks the schema as "assumed... confirm against live".
- `uniswap-swap.ts` is a stub: `getUniswapQuote` returns `null`, `executeUniswapSwap` throws `'not yet implemented for multi-chain'`. It was gutted when `@mantleagents/mantle-data` (the AVE SDK) was scoped to non-Mantle chains. Its original shape used Uniswap V3 QuoterV2/SwapRouter02 ABIs.
- `routes/trade.ts`: `/api/trade/quote` and `/api/trade/balance` return HTTP 501. `convert-to-usdc.ts` returns empty results.

Already working and reusable:
- `lib/relayer.ts` — viem relayer from `EVM_SIGNER_PRIVATE_KEY` on Mantle (`getRelayer()`, `sendRelayerTransaction({to,data,value})` → waits for receipt, returns txHash). Pays gas. Same wallet already used for ERC-8004 registration + attestation commits.
- `lib/chains.ts` — Mantle network config + fail-loud address getters; `lib/chain-client.ts` — shared viem `PublicClient` for reads.
- `packages/contracts` — solc compile (`compile.ts`) + viem deploy pattern (`deploy-mock-tokens.ts`, `deploy-attestation-registry.ts`). Mock tokens (mUSDC 6dec, mUSDT 6dec, mWMNT 18dec) have a public `faucet()`.

On-chain reality (verified `eth_getCode` @ chainId 5003): no usable external DEX. Agni testnet addresses dead on 5003; FusionX V2 live but non-standard ABI; and our mock tokens have no pool anywhere. Conclusion: deploy our own DEX and seed it.

## Goals / Non-Goals

**Goals:**
- Real, mantlescan-verifiable on-chain swaps executed by the relayer for both agent-driven trades and manual swaps.
- Deterministic, self-contained execution with no third-party/testnet-DEX dependency.
- Functional `/api/trade/quote`, `/api/trade/balance`, and `convert-to-usdc`.
- Preserve attestation + timeline behavior; replace `trade_skipped` with `trade_executed` on success.
- Reuse the existing relayer, chain config, and contracts tooling.

**Non-Goals:**
- AMM price accuracy vs real markets (seeded test liquidity defines price).
- Multi-DEX routing / aggregation / multi-hop optimization (single known DEX, direct or via-WMNT path).
- Yield vault execution (`vault-adapters/ichi.ts`) — out of scope, stays stubbed.
- Solana execution; gasless/sponsored UX (relayer pays gas, that's the model).
- Replacing CoinGecko price-service (DEX is for execution, not market data).

## Decisions

### 1. Deploy canonical Uniswap V2 (not V3, not a mock router)
Use audited Uniswap V2 `Factory` + `Router02` + `WETH9` (as WMNT). *Why V2 over V3*: V2 has no tick/position math, so pool creation + liquidity seeding is a couple of calls (`addLiquidity`), and quoting is a pure `getAmountsOut` — far less surface to get wrong than V3 for a hackathon, while still being a real AMM with real slippage (which exercises the rules-engine guardrails). *Why not a MockSwapRouter*: "mock" reads weak to judges and gives no real AMM mechanics. *Why not external DEX (FusionX/Agni)*: dead/non-standard on 5003 and no mock-token liquidity; a third-party testnet dependency is a demo-day failure risk.

### 2. Deploy + seed in one script, persist addresses to env
`scripts/deploy-dex.ts`: deploy WETH9/WMNT (or reuse the existing mWMNT as a plain ERC20 traded pair), deploy Factory, deploy Router02(factory, WMNT), then for each configured pair (mUSDC/mWMNT, mUSDT/mWMNT, mUSDC/mUSDT): `faucet()` to mint into the relayer, `approve` the router, `createPair` (implicit via `addLiquidity`), and `addLiquidity` to seed. Print `MANTLE_DEX_ROUTER_ADDRESS` and `MANTLE_DEX_FACTORY_ADDRESS`; operator pastes them into `apps/api/.env`. *Alternative considered*: deterministic CREATE2 addresses to avoid env wiring — rejected as overkill; the project already wires deployed addresses via env getters (consistent with attestation registry + mock tokens).

### 3. `chains.ts` getters, fail-loud
Add `getMantleDexRouterAddress()` and `getMantleDexFactoryAddress()` mirroring existing getters (read env, throw if unset). Keeps the "no guessed addresses" invariant.

### 4. `uniswap-swap.ts` implementation via relayer
- `getUniswapQuote({tokenIn, tokenOut, amountIn})`: build path (`[tokenIn, tokenOut]`, or `[tokenIn, WMNT, tokenOut]` if no direct pair), call `router.getAmountsOut(amountIn, path)` via the shared `PublicClient`, return `{ amountOut, path }` (or `null` if no pool / quote reverts).
- `executeUniswapSwap({tokenIn, tokenOut, amountIn, slippageBps})`: ensure ERC20 allowance (reuse the existing `ensureErc20Allowance` pattern from `trade-executor.ts`), compute `amountOutMin = amountOut * (10000 - slippageBps) / 10000`, then `sendRelayerTransaction` with encoded `swapExactTokensForTokens(amountIn, amountOutMin, path, relayerAddress, deadline)`. Return `{ txHash, amountIn, amountOut }`. The relayer (`EVM_SIGNER_PRIVATE_KEY`) is both signer and recipient — consistent with the relayer-as-execution-wallet model already linked via ERC-8004 `setAgentWallet`.
- *Signature note*: drop the dead `serverWalletId`/`serverWalletAddress` params; the relayer is the wallet. Callers updated accordingly.

### 5. `trade-executor.ts` rewire
`executeMantle()` and `executeSwap()` call `getUniswapQuote` + `executeUniswapSwap` instead of RealClaw. On success emit `trade_executed` (real txHash); map failures through the existing `mapFailureCategory` (slippage/insufficient/etc.). `trade_skipped` only when the DEX env is unset (genuine "not configured"). Token amount scaling uses `getTokenDecimals` (mUSDC/mUSDT 6, mWMNT 18) rather than the current hardcoded `1e18`.

### 6. Un-stub routes/services
- `/api/trade/quote`: call `getUniswapQuote`, return amounts (replaces 501).
- `/api/trade/balance`: read ERC20 `balanceOf` via `chain-client` `PublicClient` (replaces 501).
- `convert-to-usdc.ts`: for each non-USDC mock token with balance, swap → mUSDC via the router; return swapped/skipped. Reuses `executeUniswapSwap`.

### 7. Retire RealClaw
Delete `realclaw-executor.ts`, remove its imports from `trade-executor.ts`, drop `REALCLAW_API_KEY`/`REALCLAW_API_BASE` from `.env`/`.env.example`, and remove the startup `isRealClawConfigured` warning. *Why delete vs keep dormant*: it's an API ghost (never functional); leaving it invites confusion and a misleading startup warning.

## Risks / Trade-offs

- **Seeded liquidity is finite** → large agent trades could move price hard or fail `amountOutMin`. Mitigation: seed generous reserves via `faucet()`; cap demo trade sizes; slippage failures surface correctly as `slippage_exceeded` (a real, demonstrable guardrail outcome).
- **Decimals mismatch (6 vs 18)** → wrong amounts if scaling stays `1e18`. Mitigation: use `getTokenDecimals` consistently in quote + execute + seed.
- **No direct pair for a requested route** → `getAmountsOut` reverts. Mitigation: fall back to a WMNT-bridged 2-hop path; return `null` (→ `trade_skipped`) only if no path exists.
- **Relayer gas exhaustion** → swaps fail if relayer MNT runs low. Mitigation: same operational note as registration/attestation (keep relayer funded via faucet); document in deploy script output.
- **Compiling full Uniswap V2 with solc 0.8** → V2 was written for 0.5/0.6 (overflow semantics). Mitigation: use a 0.8-compatible Uniswap V2 port (e.g. `unchecked` arithmetic) or pin a 0.6 solc for these contracts in `compile.ts`. Decide at apply time based on the existing solc setup.
- **Deployed addresses must be wired to env** → app fails loud if unset. Mitigation: deploy script prints exact env lines; `chains.ts` getters throw with a clear message.

## Migration Plan

1. Add Uniswap V2 contracts to `packages/contracts`; ensure `compile.ts` handles their solc version.
2. Run `deploy-dex.ts` against Mantle Sepolia (relayer key, funded with MNT) → deploy + seed pools → capture printed addresses.
3. Set `MANTLE_DEX_ROUTER_ADDRESS` / `MANTLE_DEX_FACTORY_ADDRESS` in `apps/api/.env`; remove `REALCLAW_*`.
4. Implement `uniswap-swap.ts`; add `chains.ts` getters.
5. Rewire `trade-executor.ts`; un-stub `routes/trade.ts` + `convert-to-usdc.ts`; delete `realclaw-executor.ts`.
6. `pnpm type-check`; run trade-executor/route tests (mock the relayer + public client); manual: trigger an agent run → confirm `trade_executed` + tx on mantlescan + attestation committed.
7. Update docs + `E2E_TESTING.md` (trade flow now executes).
8. **Rollback**: revert the change; restore `realclaw-executor.ts` + `REALCLAW_*` env (returns to `trade_skipped`). Deployed DEX contracts can be left on-chain (harmless) or ignored. No DB migration.

## Open Questions

- Which token pairs to seed at deploy time? Proposed default: mUSDC/mWMNT, mUSDT/mWMNT, mUSDC/mUSDT (covers the FX/yield demo pairs; WMNT-bridged routing covers the rest).
- Reuse the existing deployed mWMNT as the router's WETH-equivalent traded token, or deploy a dedicated WETH9 with deposit/withdraw? Proposed: deploy a real WETH9 as WMNT so native-wrap paths work and Router02's `WETH()` invariant holds; keep mWMNT as a normal ERC20 pair token. Confirm at apply time.
