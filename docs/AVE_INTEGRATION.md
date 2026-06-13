# AVE Integration Deep-Dive

Detailed documentation of how MantleAgents integrates with AVE Cloud APIs. This covers the SDK wrapper architecture, every endpoint used, trade execution flows, monitoring integration, error handling, and chain support.

## 1. Overview

### AVE Skills Used

MantleAgents uses two AVE Cloud skills:

- **`ave-data-rest`** — Real-time token data, pricing, kline charts, holder analysis, contract risk detection, trending tokens, wallet analytics. This powers the monitoring agent, AI analysis pipeline, and dashboard market data.
- **`ave-trade-chain-wallet`** — DEX-aggregated swap execution with chain-specific transaction creation and broadcasting. This powers both the autonomous agent trades and manual user swaps.

### Why Chain-Wallet Over Proxy-Wallet

We chose the **chain-wallet** approach over proxy-wallet for several reasons:

1. **Key custody** — The `signTransaction` callback pattern keeps private keys in our server code, never sent to AVE. The SDK creates unsigned transactions, our code signs them, then we broadcast through AVE.
2. **Chain flexibility** — Chain-wallet supports both EVM (BSC, Ethereum, Base) and Solana signing flows in a unified interface, while proxy-wallet would limit us to AVE-managed wallets.
3. **Auditability** — Every transaction is signed locally, so the full lifecycle (create -> sign -> broadcast) is auditable on our side.

### Chain Priority

- **Solana** — Primary chain. Fastest execution, lowest fees, deepest DEX liquidity for meme tokens and new launches.
- **BSC** — Secondary chain. Strong for BNB ecosystem tokens and PancakeSwap liquidity.
- **Ethereum / Base** — Data queries supported now, trading planned for a future release.

## 2. Data Integration (`ave-data-rest`)

All data endpoints go through the `@mantleagents/mantle-data` SDK package (`packages/ave/src/data-rest.ts`). The base URL is `https://data.ave-api.xyz/v2`, authenticated via the `X-API-KEY` header.

### Endpoints Used

| Endpoint | Function | Usage |
|---|---|---|
| `GET /v2/tokens` | `searchToken()` | Token search by keyword or address with optional chain filter |
| `GET /v2/tokens/{address}-{chain}` | `getTokenDetail()` | Full token profile: price, market cap, FDV, TVL, holder count, 5m/1h/4h/24h price changes |
| `POST /v2/tokens/search` | `batchSearchTokens()` | Batch token detail lookup (max 50) |
| `POST /v2/tokens/price` | `batchTokenPrices()` | Batch price fetch (max 200 tokens) — used by the monitor's 30s polling loop |
| `GET /v2/klines/token/{address}-{chain}` | `getKlineByToken()` | Candlestick data at configurable intervals (1m to monthly) |
| `GET /v2/klines/pair/{pair}-{chain}` | `getKlineByPair()` | Pair-level candlestick data |
| `GET /v2/tokens/top100/{address}-{chain}` | `getTop100Holders()` | Top 100 holders by balance |
| `GET /v2/tokens/holders/{address}-{chain}` | `getHolders()` | Paginated holder list with sort options |
| `GET /v2/contracts/{address}-{chain}` | `checkContractRisk()` | Honeypot detection, tax analysis, ownership status, risk scoring |
| `GET /v2/txs/{pair}-{chain}` | `getSwapTxs()` | Recent swap transactions for a pair |
| `GET /v2/tokens/platform` | `getPlatformTokens()` | Platform-curated tokens by tag (hot, new, meme, etc.) |
| `GET /v2/tokens/trending` | `getTrending()` | Trending tokens per chain with pagination |
| `GET /v2/tokens/main` | `getMainTokens()` | Main/blue-chip tokens for a chain |
| `GET /v2/supported_chains` | `getSupportedChains()` | List of all supported chain identifiers |
| `GET /v2/address/walletinfo/tokens` | `getWalletTokens()` | Wallet token holdings |
| `GET /v2/address/walletinfo` | `getWalletOverview()` | Wallet overview (total value, chain breakdown) |
| `GET /v2/address/pnl` | `getAddressPnl()` | Per-token PnL for a wallet address |

### Data Flow

```
AVE Data REST
     |
     v
price-service.ts (1-min cache)  <---  ave-monitor.ts (30s poll)
     |                                      |
     v                                      v
market-data-service.ts             Supabase (watchlist prices)
     |                                      |
     v                                      v
Dashboard API routes              WebSocket alert broadcast
     |
     v
llm-analyzer.ts (Gemini prompt context)
```

The `price-service.ts` acts as the centralized price gateway. It wraps AVE calls with a 1-minute in-memory cache (`Map<string, CachedPrice>`) to avoid redundant API hits when multiple services request the same token's price within the same minute.

### Request/Response Examples

**Token Search:**

```typescript
import { AveClient, searchToken } from '@mantleagents/mantle-data';

const client = new AveClient();
const results = await searchToken(client, {
  keyword: 'SOL',
  chain: 'solana',
  limit: 10,
  orderby: 'tx_volume_u_24h',
});

// Response: TokenSearchResult[]
// [{ token_address, chain, name, symbol, price, market_cap, fdv, holder_count, ... }]
```

**Contract Risk Check:**

```typescript
import { AveClient, checkContractRisk } from '@mantleagents/mantle-data';

const client = new AveClient();
const risk = await checkContractRisk(client, 'bsc', '0xTokenAddress...');

// Response: ContractRisk
// {
//   risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
//   risk_score: 15,
//   honeypot: false,
//   buy_tax: 0,
//   sell_tax: 0,
//   ownership_renounced: true,
//   can_mint: false,
//   can_burn: false,
//   holder_concentration: 0.12,
//   dex_liquidity: 500000
// }
```

**Batch Price Fetch:**

```typescript
import { AveClient, batchTokenPrices } from '@mantleagents/mantle-data';

const client = new AveClient();
const prices = await batchTokenPrices(client, {
  token_ids: [
    '0xTokenA-bsc',
    '0xTokenB-bsc',
    'SolTokenMint-solana',
  ],
});

// Response: Record<string, TokenDetail>
// { '0xTokenA-bsc': { price: 1.23, ... }, ... }
```

## 3. Trade Integration (`ave-trade-chain-wallet`)

All trade endpoints go through `packages/ave/src/trade-chain-wallet.ts`. The base URL is `https://bot-api.ave.ai`, authenticated via the `AVE-ACCESS-KEY` header (note: different header name from Data REST).

### Trade Execution Flow

```
Signal (buy SOL-token on solana, confidence 85)
  |
  v
trade-executor.ts
  |
  ├── 1. getAmountOut()        — Get quote (estimated output, decimals)
  |
  ├── 2. createSolanaTx()      — AVE creates unsigned tx with DEX routing
  |        (or createEvmTx for BSC/ETH)
  |
  ├── 3. signTransaction()     — Local signing callback (private key never leaves server)
  |
  └── 4. sendSignedSolanaTx()  — Broadcast to network
           (or sendSignedEvmTx for BSC/ETH)
              |
              v
         { hash: '5K2f...', err?: null }
```

### High-Level `executeTrade` Function

The SDK provides a high-level `executeTrade` function that orchestrates the full flow:

```typescript
import { AveClient, executeTrade } from '@mantleagents/mantle-data';

const client = new AveClient();

const result = await executeTrade(client, {
  chain: 'solana',
  walletAddress: 'YourSolanaWallet...',
  inAmount: '1000000',        // lamports
  inTokenAddress: 'sol',       // native SOL
  outTokenAddress: 'TokenMint...',
  swapType: 'buy',
  slippage: '100',             // 1% in basis points
  solanaFee: '100000',         // 0.0001 SOL priority fee
  useMev: false,
  signTransaction: async (txContent: string) => {
    // Sign the base64-encoded transaction with your private key
    return signedTxBase64;
  },
});

console.log(result.hash); // Transaction hash
```

### Chain-Specific Signing

**EVM Chains (BSC, Ethereum, Base):**

1. `createEvmTx()` returns a `txContent` object with `{ data, to, value }` fields
2. The `signTransaction` callback receives `JSON.stringify(txContent)`
3. Sign with the EVM private key (hex format, via viem or ethers)
4. `sendSignedEvmTx()` broadcasts the signed transaction

**Solana:**

1. `createSolanaTx()` returns a base64-encoded transaction in `txContent`
2. The `signTransaction` callback receives the raw base64 string
3. Decode, sign with the Solana private key (base58 format), re-encode
4. `sendSignedSolanaTx()` broadcasts the signed transaction

### Trade API Endpoints

| Endpoint | Function | Purpose |
|---|---|---|
| `POST /v1/thirdParty/chainWallet/getAmountOut` | `getAmountOut()` | Pre-trade quote with estimated output |
| `POST /v1/thirdParty/chainWallet/createEvmTx` | `createEvmTx()` | Create unsigned EVM swap tx |
| `POST /v1/thirdParty/chainWallet/sendSignedEvmTx` | `sendSignedEvmTx()` | Broadcast signed EVM tx |
| `POST /v1/thirdParty/chainWallet/createSolanaTx` | `createSolanaTx()` | Create unsigned Solana swap tx |
| `POST /v1/thirdParty/chainWallet/sendSignedSolanaTx` | `sendSignedSolanaTx()` | Broadcast signed Solana tx |

## 4. Monitoring Integration

The monitoring system (`apps/api/src/services/ave-monitor.ts`) uses AVE Data REST as its sole data source for token prices and risk analysis.

### Watchlist Polling Loop

```
startMonitorCron()
  |
  └── setInterval(pollPricesAndCheckAlerts, 30_000)
         |
         ├── 1. Query all watchlist tokens from Supabase
         ├── 2. Deduplicate by chain+address
         ├── 3. For each unique token:
         |      └── getTokenPrice(chain, address)  --> AVE Data REST
         ├── 4. Query all active (untriggered) alerts from Supabase
         └── 5. For each alert:
                ├── Compare currentPrice vs threshold
                └── If triggered:
                    ├── Update alert in Supabase (triggered=true, triggered_at, triggered_price)
                    └── agentEvents.emit('monitor:{wallet}', { type: 'alert_triggered', ... })
                         |
                         └── WebSocket broadcast to connected dashboard
```

### Risk Scoring on Token Add

Every call to `addToWatchlist()` automatically triggers a risk check:

```typescript
// Inside addToWatchlist() in ave-monitor.ts
const riskScore = await checkContractRisk(client, chain, tokenAddress);
// Returns: { risk_level, risk_score, honeypot, buy_tax, sell_tax, ... }

// Stored alongside the watchlist item in Supabase
await supabaseAdmin.from('token_watchlist').upsert({
  wallet_address: walletAddress,
  chain,
  token_address: tokenAddress,
  token_symbol: tokenSymbol,
  risk_score: riskScore,  // Full ContractRisk object stored as JSONB
});
```

The risk check is non-blocking — if the AVE contract risk endpoint fails (network issue, unsupported token), the token is still added to the watchlist with `risk_score: null`. The frontend displays the risk badge based on `risk_level`:
- `LOW` — Green badge
- `MEDIUM` — Yellow badge
- `HIGH` — Orange badge
- `CRITICAL` — Red badge with warning

### Price Alert Matching Logic

Alerts support two conditions:
- `above` — Triggers when `currentPrice >= threshold`
- `below` — Triggers when `currentPrice <= threshold`

Once triggered, an alert is marked as `triggered: true` in Supabase and is never checked again. The triggered event is emitted via the `agentEvents` EventEmitter, which the WebSocket server picks up and broadcasts to the user's connected dashboard.

## 5. Error Handling

### Retry Logic (3x Exponential Backoff)

The `AveClient` in `packages/ave/src/client.ts` implements automatic retry with exponential backoff for all API calls:

```typescript
// From packages/ave/src/client.ts — AveClient.request()
for (let attempt = 0; attempt < this.maxRetries; attempt++) {
  if (attempt > 0) {
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10_000);
    await sleep(delay);
  }

  try {
    const res = await fetch(url, { ...init, headers });

    if (res.status === 429) {
      lastError = new AveApiError(429, 'Rate limited', 429);
      continue; // Retry on rate limit
    }

    if (!res.ok) {
      throw new AveApiError(res.status, `HTTP ${res.status} ${res.statusText}`, res.status);
    }

    const json = await res.json();
    if (json.status !== 1 && json.status !== 200) {
      throw new AveApiError(json.status, json.msg);
    }

    return json.data;
  } catch (err) {
    if (err instanceof AveApiError && err.httpStatus !== 429) {
      throw err; // Non-retryable API errors thrown immediately
    }
    lastError = err;
  }
}
throw lastError ?? new Error('AVE API request failed after retries');
```

**Retry schedule:**
| Attempt | Delay |
|---|---|
| 1st | 0ms (immediate) |
| 2nd | 1,000ms |
| 3rd | 2,000ms |

Maximum delay is capped at 10 seconds (relevant if `maxRetries` is increased beyond default).

**What gets retried:**
- HTTP 429 (Rate Limited) — always retried
- Network errors (fetch throws) — retried
- Non-429 HTTP errors (4xx, 5xx) — **not retried**, thrown immediately

### Fallback Behavior When API is Down

The system is designed to degrade gracefully:

- **Price service** — `fetchAllPrices()` first attempts a batch request via `batchTokenPrices()`. If the batch call fails, it falls back to individual `getTokenPrice()` calls via `Promise.allSettled()`, so partial failures don't block the entire batch.
- **Risk check** — If `checkContractRisk()` fails during `addToWatchlist()`, the token is still added with `risk_score: null`. The feature degrades to "no risk data" rather than blocking the add operation.
- **Monitor cron** — If price polling fails for individual tokens, those tokens are silently skipped (`catch` inside the map). The alert checking loop only processes tokens that successfully returned prices.
- **Trade executor** — Trade failures are **not** silently swallowed. `AveApiError` is propagated up to the agent cron, which logs the failure to the agent timeline in Supabase and emits a progress event via WebSocket.

### Rate Limiting Awareness

- The `AveClient` automatically retries 429 responses with exponential backoff
- The price cache (1-minute TTL) reduces redundant calls to the same endpoint
- Batch endpoints (`batchTokenPrices` with up to 200 tokens per call) minimize the number of individual requests during the 30-second monitoring poll
- The configurable `maxRetries` (default 3) can be adjusted via `AveClientConfig` if rate limits are hit frequently

## 6. Chain Support Matrix

| Feature | Solana | BSC | Ethereum | Base |
|---|---|---|---|---|
| Token Search | Supported | Supported | Supported | Supported |
| Token Detail | Supported | Supported | Supported | Supported |
| Price Data | Supported | Supported | Supported | Supported |
| Kline / Candlestick | Supported | Supported | Supported | Supported |
| Holder Analysis | Supported | Supported | Supported | Supported |
| Contract Risk Check | Supported | Supported | Supported | Supported |
| Trending Tokens | Supported | Supported | Supported | Supported |
| Wallet Analytics | Supported | Supported | Supported | Supported |
| DEX Trading | Supported | Supported | Planned | Planned |
| Monitoring / Alerts | Supported | Supported | Supported | Supported |

**Notes:**
- Solana and BSC have full data + trading support and are the primary chains for MantleAgents
- Ethereum and Base have full data support; trading integration is on the roadmap (the AVE Trade API supports these chains, but client-side signing implementation is pending)
- The AVE SDK types also define `arbitrum`, `optimism`, `avax`, `polygon`, and `ton` as valid chain identifiers for future expansion
