## ADDED Requirements

### Requirement: Self-hosted Uniswap V2 DEX on Mantle Sepolia
The system SHALL provide canonical Uniswap V2 contracts (Factory, Router02, and a WETH9/WMNT) deployable to Mantle Sepolia via the existing `packages/contracts` solc + viem tooling.

#### Scenario: Deploy DEX contracts
- **WHEN** the DEX deploy script is run against Mantle Sepolia with a funded relayer key
- **THEN** a UniswapV2Factory, UniswapV2Router02 (bound to the deployed WETH/WMNT), and WETH/WMNT are deployed and their addresses are printed

#### Scenario: Router bound to factory
- **WHEN** the Router02 is deployed
- **THEN** its `factory()` returns the deployed Factory address and its `WETH()` returns the deployed WETH/WMNT address

### Requirement: Seed liquidity for mock-token pairs
The deploy script SHALL create and seed liquidity pools for the configured mock-token pairs using the mock tokens' `faucet()` to mint balances before adding liquidity.

#### Scenario: Pools seeded
- **WHEN** the deploy script runs for the configured pairs (e.g. mUSDC/mWMNT, mUSDT/mWMNT, mUSDC/mUSDT)
- **THEN** each pair is created in the Factory and seeded via `addLiquidity`, and `getPair` returns a non-zero pair address with non-zero reserves

#### Scenario: Decimals respected when seeding
- **WHEN** liquidity is added for a pair with mismatched decimals (e.g. mUSDC 6-dec / mWMNT 18-dec)
- **THEN** amounts are scaled by each token's actual decimals so the seeded price is correct

### Requirement: DEX addresses surfaced via config getters
The system SHALL expose the deployed DEX addresses through `chains.ts` getters that read `MANTLE_DEX_ROUTER_ADDRESS` and `MANTLE_DEX_FACTORY_ADDRESS` and throw if unset.

#### Scenario: Getter returns configured address
- **WHEN** `getMantleDexRouterAddress()` is called and the env var is set
- **THEN** it returns the configured router address

#### Scenario: Getter fails loud when unset
- **WHEN** `getMantleDexRouterAddress()` or `getMantleDexFactoryAddress()` is called without the env var set
- **THEN** it throws an error naming the missing variable rather than returning a guessed address
