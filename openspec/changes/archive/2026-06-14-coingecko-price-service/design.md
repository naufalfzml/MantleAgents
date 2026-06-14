## Context

`price-service.ts` currently wraps `MantleDataClient` which hits `https://data.ave-api.xyz/v2` with `X-API-KEY` auth. The client is only used for price fetching in this service — trade execution uses a separate path. CoinGecko API supports fetching prices by contract address on the `mantle` platform ID, which maps directly to our use case.

CoinGecko endpoints:
- Batch: `GET /simple/token_price/mantle?contract_addresses=0x...&vs_currencies=usd`
- Single: `GET /coins/mantle/contract/{address}` (includes market data)
- Auth: `x-cg-demo-api-key: <COINGECKO_API_KEY>` header (free tier) or `x-cg-pro-api-key` (pro)

## Goals / Non-Goals

**Goals:**
- Replace AVE API calls with CoinGecko in `price-service.ts`
- Keep `getTokenPrice()`, `fetchBatchPrices()`, `fetchAllPrices()` signatures identical
- Maintain in-memory 1-minute cache behavior
- Support Mantle network tokens by contract address

**Non-Goals:**
- Replacing `packages/mantle-data` entirely (still used for trade execution)
- Supporting multi-chain price fetching (Mantle only for now)
- Adding CoinGecko as a package — use native `fetch` (Node 18+)

## Decisions

### 1. Use native `fetch` directly — no SDK
CoinGecko has an official JS SDK but it adds a dependency for simple REST calls. Node 18+ has native fetch. Keep it lean.

### 2. Use `/simple/token_price/mantle` for batch, `/coins/mantle/contract/{address}` for single
`/simple/token_price` supports up to 50 addresses per call — perfect for `fetchBatchPrices`. Single token calls use the richer endpoint for market detail (volume, price change).

### 3. Free tier vs Pro tier handling
Free tier uses `x-cg-demo-api-key` header and base URL `https://api.coingecko.com/api/v3`. Pro uses `x-cg-pro-api-key` and `https://pro-api.coingecko.com/api/v3`. Detect by checking if key starts with `CG-` (demo) or not (pro). This way same env var works for both tiers.

### 4. Keep cache layer unchanged
Existing 1-minute in-memory cache in `price-service.ts` stays — just swap what's underneath.

## Risks / Trade-offs

- **CoinGecko free tier rate limit (30 req/min)** → Mitigation: batch calls with `/simple/token_price` reduce request count; 1-min cache prevents repeated fetches
- **Token not listed on CoinGecko** → Our mock tokens (mUSDC, mUSDT, mWMNT) are not real tokens — CoinGecko won't have prices for them. Mitigation: return `null` gracefully; agent cron handles missing prices
- **Mantle platform ID** → CoinGecko uses `mantle` as the platform ID for Mantle network contract addresses (confirmed in CoinGecko docs)

## Migration Plan

1. Add `COINGECKO_API_KEY` to `.env` (already present as empty)
2. Rewrite `price-service.ts` internals
3. Remove `MARKETDATA_API_KEY` from `.env`
4. Restart API — verify no price fetch errors in logs
