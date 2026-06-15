## Context

The swap UI in `apps/web/src/app/(app)/swap/_components/swap-content.tsx` hardcodes token lists that were originally designed for a multi-chain FX stablecoin vision (BSC/Celo xm tokens via AVE API). On Mantle Sepolia, only 3 Mock ERC20 tokens are deployed with active Uniswap V2 liquidity pools: USDC (6 decimals), USDT (6 decimals), WMNT (18 decimals). The backend `getMantleTokenBySymbol()` only resolves these 3 symbols; all others return null, causing the quote/swap endpoints to return 400 errors.

## Goals / Non-Goals

**Goals:**
- Restrict the swap UI token dropdowns to the 3 tokens available on Mantle Sepolia DEX
- Allow swapping in any direction between the 3 tokens (USDC↔USDT, USDC↔WMNT, USDT↔WMNT)
- Remove USDm and all 14 xm stablecoins from the swap UI entirely

**Non-Goals:**
- Deploying new tokens to Mantle Sepolia
- Changing backend token resolution logic
- Modifying the FX agent or yield agent token lists (those are separate from manual swap)

## Decisions

**Single flat token list instead of BASE/STABLE split**

The current two-list design (BASE → can swap to STABLE, STABLE → can only swap to BASE) was designed for FX flows where stablecoins have a clear hierarchy. With only 3 tokens that are all interchangeable, a single `MANTLE_TOKENS` array is simpler and more correct. The "to" dropdown just shows all tokens except the currently selected "from" token.

**WMNT as a valid from-token**

WMNT is deployed and has liquidity. Restricting it to only "to" token would needlessly limit users who hold WMNT and want to swap out. Any token can be either side.

**Default pair: USDC → WMNT**

USDC is the most recognizable base token; WMNT is the most "interesting" output (native wrapped token), making it a natural default pair for demo purposes.

## Risks / Trade-offs

- [Risk] Agent portfolio may hold xm token symbols in DB from earlier runs → Mitigation: Swap UI only controls manual swap; agent holdings display is separate and unaffected
- [Risk] Flip button needs to handle the new flat-list model → Mitigation: Simple swap of fromToken/toToken still works; toTokens filter just excludes fromToken

## Migration Plan

Single-file frontend change. No backend changes, no migrations. Deployable immediately.
