## Why

The swap UI currently displays 17 tokens (USDC, USDT, USDm, and 14 xm stablecoins like EURm, BRLm, KESm, etc.), but the Mantle Sepolia deployment only has 3 Mock ERC20 tokens with active DEX liquidity: USDC, USDT, and WMNT. Any swap involving the other 14 tokens fails with a 400 error because `getMantleTokenBySymbol()` in the backend cannot resolve them.

## What Changes

- Remove `USDm` from `BASE_TOKENS` in the swap UI — it has no Mantle address
- Remove all 14 xm stablecoins (`EURm`, `BRLm`, `KESm`, `PHPm`, `COPm`, `XOFm`, `NGNm`, `JPYm`, `CHFm`, `ZARm`, `GBPm`, `AUDm`, `CADm`, `GHSm`) from `STABLE_TOKENS` in the swap UI
- Add `WMNT` as an available swap token (it is deployed and has liquidity)
- Simplify swap direction logic: any of the 3 tokens can be swapped to any other
- Update default `fromToken` / `toToken` to valid token pair (USDC → WMNT)

## Capabilities

### New Capabilities
<!-- none — this is a fix/trim, no new spec needed -->

### Modified Capabilities
- `swap-ui-tokens`: Token selection in the manual swap page is now restricted to tokens actually available on the deployed Mantle Sepolia DEX (USDC, USDT, WMNT)

## Impact

- `apps/web/src/app/(app)/swap/_components/swap-content.tsx` — primary change
- No backend changes required (backend already correctly supports only USDC/USDT/WMNT)
- No contract changes required
