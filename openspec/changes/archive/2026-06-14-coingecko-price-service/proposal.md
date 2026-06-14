## Why

`price-service.ts` depends on `MantleDataClient` from `packages/mantle-data` which requires `MARKETDATA_API_KEY` from AVE API (`data.ave-api.xyz`). AVE API key is not self-serve — it requires emailing business@ave.ai. This blocks all market data fetching (price snapshots, agent signal generation, monitor alerts). CoinGecko provides a free self-serve API key with Mantle network support, making it the practical replacement.

## What Changes

- Replace `MantleDataClient` usage in `price-service.ts` with direct CoinGecko REST API calls
- Keep identical function signatures: `getTokenPrice()`, `fetchBatchPrices()`, `fetchAllPrices()`
- Remove `MARKETDATA_API_KEY` env var dependency
- Use existing `COINGECKO_API_KEY` env var (already in `.env`)
- Remove `MantleDataClient` import from `price-service.ts` (packages/mantle-data remains for trade execution)

## Capabilities

### New Capabilities
- `coingecko-token-price`: Fetch token prices on Mantle network via CoinGecko `/coins/mantle/contract/{address}` and `/simple/token_price/mantle` endpoints

### Modified Capabilities
- (none — same external behavior, internal implementation replaced)

## Impact

- `apps/api/src/services/price-service.ts` — full rewrite of data fetching internals
- `apps/api/.env` — `MARKETDATA_API_KEY` removed, `COINGECKO_API_KEY` used
- `apps/api/src/services/price-service.test.ts` — update mocks from MantleDataClient to fetch
- `packages/mantle-data` — not changed (still used for trade execution path)
