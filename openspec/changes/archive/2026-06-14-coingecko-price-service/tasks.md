## 1. Rewrite price-service.ts

- [x] 1.1 Remove `MantleDataClient`, `Chain`, `TokenDetail`, `getTokenDetail`, `batchTokenPrices` imports from `price-service.ts`
- [x] 1.2 Add CoinGecko client helper: detect free vs pro key, build base URL and auth header from `COINGECKO_API_KEY`; log warning at startup if key missing
- [x] 1.3 Implement `fetchBatchPrices(tokenAddresses: string[])` using `/simple/token_price/mantle?contract_addresses=<csv>&vs_currencies=usd`
- [x] 1.4 Implement `getTokenPrice(chain, address)` using batch endpoint under the hood (single address); return `null` if not found
- [x] 1.5 Implement `fetchAllPrices(tokens)` iterating over configured tokens using batch endpoint
- [x] 1.6 Keep existing 1-minute in-memory cache behavior unchanged

## 2. Update env vars

- [x] 2.1 Remove `MARKETDATA_API_KEY` from `apps/api/.env`
- [x] 2.2 Ensure `COINGECKO_API_KEY` is present in `apps/api/.env` (already exists as empty)

## 3. Update tests

- [x] 3.1 Rewrite `price-service.test.ts` — mock `fetch` instead of `MantleDataClient`
- [x] 3.2 Add test: successful batch fetch returns price map
- [x] 3.3 Add test: token not on CoinGecko returns null gracefully
- [x] 3.4 Add test: missing `COINGECKO_API_KEY` logs warning, returns null without crash
- [x] 3.5 Add test: cache returns cached price within 60s without new HTTP call

## 4. Verify

- [x] 4.1 Run `pnpm --filter @mantleagents/api test` — confirm all price-service tests pass
- [x] 4.2 Run `pnpm type-check` — no TypeScript errors
- [x] 4.3 Restart `pnpm dev` — confirm `[price-service] fetchAllPrices failed` error gone from logs
- [x] 4.4 Fill `COINGECKO_API_KEY` in `.env` with real key and verify prices fetch successfully
