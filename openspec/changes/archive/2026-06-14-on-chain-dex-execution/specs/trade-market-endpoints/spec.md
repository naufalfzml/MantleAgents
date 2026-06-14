## ADDED Requirements

### Requirement: Trade quote endpoint
The system SHALL implement `POST /api/trade/quote` to return an on-chain swap quote via `getUniswapQuote`, replacing the prior HTTP 501 stub.

#### Scenario: Quote returned
- **WHEN** an authenticated request posts a valid `tokenIn`, `tokenOut`, and `amountIn`
- **THEN** the endpoint returns the expected output amount and path from the deployed router

#### Scenario: No liquidity for pair
- **WHEN** the requested pair has no pool/path
- **THEN** the endpoint returns a clear "no route/liquidity" response rather than 501

### Requirement: Trade balance endpoint
The system SHALL implement `GET /api/trade/balance` to read on-chain ERC20 balances via the shared public client, replacing the prior HTTP 501 stub.

#### Scenario: Balance read
- **WHEN** an authenticated request asks for a token balance
- **THEN** the endpoint returns the ERC20 `balanceOf` value (scaled by token decimals) for the requested wallet/token

### Requirement: Convert-to-USDC routing
The system SHALL implement `convertWalletToUsdc` to swap non-USDC mock token balances into mUSDC through the deployed router, returning which tokens were swapped and which were skipped.

#### Scenario: Tokens converted
- **WHEN** the wallet holds non-USDC mock tokens with a tradable pool
- **THEN** each is swapped to mUSDC via the router and reported under `swapped` with its txHash

#### Scenario: Untradable token skipped
- **WHEN** a token has no pool/route to mUSDC or zero balance
- **THEN** it is reported under `skipped` with a reason and no transaction is sent
