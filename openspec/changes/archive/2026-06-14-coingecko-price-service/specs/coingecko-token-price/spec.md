## ADDED Requirements

### Requirement: Fetch single token price via CoinGecko
The system SHALL fetch a single token price by contract address on Mantle network using CoinGecko `/simple/token_price/mantle` endpoint, returning the USD price or `null` if not found.

#### Scenario: Token found on CoinGecko
- **WHEN** `getTokenPrice('mantle', '0xabc...')` is called and CoinGecko returns a price
- **THEN** the function returns the USD price as a number and caches it for 60 seconds

#### Scenario: Token not listed on CoinGecko
- **WHEN** CoinGecko returns empty result for the contract address
- **THEN** the function returns `null` without throwing

#### Scenario: Cache hit
- **WHEN** `getTokenPrice()` is called within 60 seconds of a previous successful fetch
- **THEN** the cached price is returned without making a new HTTP request

### Requirement: Batch fetch token prices via CoinGecko
The system SHALL fetch multiple token prices in a single CoinGecko API call using `/simple/token_price/mantle?contract_addresses=<comma-separated>`.

#### Scenario: Successful batch fetch
- **WHEN** `fetchBatchPrices(['0xabc...', '0xdef...'])` is called
- **THEN** a single HTTP request is made and prices for all found tokens are returned as a map

#### Scenario: Some tokens not found
- **WHEN** some contract addresses are not listed on CoinGecko
- **THEN** only found tokens appear in the result map; missing ones are omitted without error

### Requirement: CoinGecko API key authentication
The system SHALL authenticate CoinGecko requests using `COINGECKO_API_KEY` env var. Free tier keys (prefix `CG-`) use `x-cg-demo-api-key` header; other keys use `x-cg-pro-api-key` header.

#### Scenario: Free tier key
- **WHEN** `COINGECKO_API_KEY` starts with `CG-`
- **THEN** requests include `x-cg-demo-api-key` header and use `https://api.coingecko.com/api/v3`

#### Scenario: Pro tier key
- **WHEN** `COINGECKO_API_KEY` does not start with `CG-`
- **THEN** requests include `x-cg-pro-api-key` header and use `https://pro-api.coingecko.com/api/v3`

#### Scenario: Missing API key
- **WHEN** `COINGECKO_API_KEY` is not set
- **THEN** system logs a warning at startup and price fetches return `null` gracefully without crashing
