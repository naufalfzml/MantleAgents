## MODIFIED Requirements

### Requirement: Swap token selection is restricted to deployed Mantle tokens
The swap UI SHALL only allow selection of tokens that are deployed and have active liquidity on the Mantle Sepolia DEX. The available tokens are: USDC, USDT, WMNT.

#### Scenario: From token dropdown shows only Mantle tokens
- **WHEN** the user opens the "From" token selector
- **THEN** the dropdown SHALL show exactly USDC, USDT, and WMNT (tokens held in portfolio that match, plus defaults)

#### Scenario: To token dropdown excludes the selected from token
- **WHEN** the user has selected a from token (e.g., USDC)
- **THEN** the "To" dropdown SHALL show the remaining 2 tokens (USDT, WMNT)

#### Scenario: Swap can be executed in any direction
- **WHEN** the user selects any pair from {USDC, USDT, WMNT}
- **THEN** the swap SHALL be submitted regardless of which token is "from" or "to"

#### Scenario: USDm and xm tokens are not available
- **WHEN** the user opens either token dropdown
- **THEN** USDm, EURm, BRLm, KESm, PHPm, COPm, XOFm, NGNm, JPYm, CHFm, ZARm, GBPm, AUDm, CADm, GHSm SHALL NOT appear

#### Scenario: Default token pair on page load
- **WHEN** the swap page first loads
- **THEN** fromToken SHALL default to USDC and toToken SHALL default to WMNT
