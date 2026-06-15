## 1. Update Token List in Swap UI

- [x] 1.1 Replace `BASE_TOKENS` and `STABLE_TOKENS` constants in `swap-content.tsx` with a single `MANTLE_TOKENS = ['USDC', 'USDT', 'WMNT']` array
- [x] 1.2 Remove `USDm` from the token list entirely
- [x] 1.3 Update default `fromToken` to `'USDC'` and default `toToken` to `'WMNT'`

## 2. Fix Token Selection Logic

- [x] 2.1 Replace `isFromBase` / two-list logic with simple flat filter: `toTokens = MANTLE_TOKENS.filter(t => t !== fromToken)`
- [x] 2.2 Update `fromTokens` to only show MANTLE_TOKENS (remove portfolio-based xm token inclusion)
- [x] 2.3 Verify `useEffect` that resets `toToken` when `fromToken` changes still works correctly with the flat list

## 3. Verify Flip Button

- [x] 3.1 Confirm `handleFlip` works correctly — swapping USDC↔WMNT, USDT↔WMNT, USDC↔USDT in both directions
