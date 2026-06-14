## Why

The agent trade loop never actually executes a swap. Step 5 of the agent cron (execute trade) has two code paths and both are dead: the RealClaw path (`executeMantle` → `realclaw-executor.ts`) calls a non-existent developer API (`openclaw.mantle.xyz` is a closed product arena, not a self-serve API — confirmed via web research and the file's own "assumed schema" comment), and the direct DEX path (`uniswap-swap.ts`) is stubbed (`getUniswapQuote` returns `null`, `executeUniswapSwap` throws). The original 0G/JakartAgents execution relied on the AVE aggregator API submitted gaslessly via Thirdweb — both have since been removed (AVE has no self-serve key; Thirdweb was replaced by the relayer in `EVM_SIGNER_PRIVATE_KEY`). Result: every agent decision ends in `trade_skipped`, so the "outcome" half of the hackathon's on-chain decision+outcome story is missing.

External testnet DEXes can't fill the gap (verified on-chain via `eth_getCode` at chainId 5003): Agni's published testnet addresses are dead on Mantle Sepolia (they target the old 5001 testnet), FusionX V2 is live but exposes a non-standard ABI (`factory()`/`WETH()` revert), and — decisively — our mock tokens (mUSDC/mUSDT/mWMNT) have no liquidity pool on any DEX. So we deploy our own canonical Uniswap V2 DEX on Mantle Sepolia, seed pools with the mock tokens, and route swaps through the existing relayer. This is deterministic, self-contained, demo-reliable, and produces real, mantlescan-verifiable swap transactions.

## What Changes

- **Deploy a canonical Uniswap V2 DEX** (`UniswapV2Factory`, `UniswapV2Router02`, `WETH9`/WMNT) to Mantle Sepolia via the existing `packages/contracts` solc + viem tooling, with a deploy+seed script that creates pools for the mock-token pairs and seeds liquidity using the mock tokens' `faucet()`.
- **Implement `uniswap-swap.ts`**: `getUniswapQuote` via router `getAmountsOut`; `executeUniswapSwap` via relayer (`approve` + `swapExactTokensForTokens`, `amountOutMin` derived from `slippageBps`) using `sendRelayerTransaction`.
- **Rewire `trade-executor.ts`**: `executeMantle()` / `executeSwap()` route Mantle trades through the new DEX path and emit `trade_executed` with a real `txHash`; `trade_skipped` remains only as a genuine fallback (e.g. unconfigured DEX).
- **Un-stub trade routes/services**: `/api/trade/quote` (uses `getUniswapQuote`), `/api/trade/balance` (reads ERC20 `balanceOf`), and `convert-to-usdc.ts` (routes mock tokens → mUSDC via the new router).
- **Retire RealClaw**: remove `realclaw-executor.ts` and the `REALCLAW_API_KEY` / `REALCLAW_API_BASE` env vars and the startup warning.
- **BREAKING**: new required env vars `MANTLE_DEX_ROUTER_ADDRESS`, `MANTLE_DEX_FACTORY_ADDRESS`; removed env vars `REALCLAW_API_KEY`, `REALCLAW_API_BASE`.
- Attestation + timeline flow is unchanged (decision+outcome already committed on-chain).

## Capabilities

### New Capabilities
- `dex-deployment`: Deploy and seed a self-hosted Uniswap V2 DEX (Factory + Router02 + WETH/WMNT) on Mantle Sepolia, including mock-token pool creation and liquidity seeding via `faucet()`, with deployed addresses surfaced through `chains.ts` getters and env.
- `onchain-swap-execution`: Execute real on-chain token swaps through the relayer against the deployed DEX (`getUniswapQuote` + `executeUniswapSwap`), used by the agent trade loop and manual swaps, emitting `trade_executed` with a verifiable `txHash`.
- `trade-market-endpoints`: Functional `/api/trade/quote` and `/api/trade/balance` endpoints plus `convert-to-usdc` routing, backed by the deployed DEX and on-chain reads.

### Modified Capabilities
- (none — no existing OpenSpec specs in `openspec/specs/`; the agent loop, attestation, and timeline external behavior is preserved)

## Impact

- **Contracts (`packages/contracts`)**:
  - Add: `contracts/UniswapV2Factory.sol`, `contracts/UniswapV2Router02.sol`, `contracts/WETH9.sol` (WMNT) and dependencies (UniswapV2Pair/ERC20/libraries), `scripts/deploy-dex.ts` (deploy + create pairs + seed), update `compile.ts` if needed.
- **API (`apps/api`)**:
  - Implement: `src/services/uniswap-swap.ts`.
  - Edit: `src/services/trade-executor.ts` (route to DEX, emit `trade_executed`), `src/services/convert-to-usdc.ts` (un-stub), `src/routes/trade.ts` (un-stub `/quote`, `/balance`), `src/lib/chains.ts` (add `getMantleDexRouter/Factory()` getters).
  - Remove: `src/services/realclaw-executor.ts`.
- **Env**: add `MANTLE_DEX_ROUTER_ADDRESS`, `MANTLE_DEX_FACTORY_ADDRESS`; remove `REALCLAW_API_KEY`, `REALCLAW_API_BASE`.
- **Dependencies**: relayer (`lib/relayer.ts`), `chain-client.ts`, and mock tokens (`deploy-mock-tokens.ts`) are reused as-is.
- **Out of scope**: `vault-adapters/ichi.ts` yield deposit path (still stubbed); Solana execution; multi-DEX routing/aggregation.
- **Docs**: `CLAUDE.md`, `README.md`, `docs/E2E_TESTING.md` (trade flow no longer `trade_skipped`), `apps/api/.env.example`.
