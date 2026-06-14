## ADDED Requirements

### Requirement: Relayer wallet from EVM_SIGNER_PRIVATE_KEY
The system SHALL provide a single relayer wallet derived from `EVM_SIGNER_PRIVATE_KEY` using viem, targeting the Mantle network from `chains.ts`, and SHALL expose its account, wallet client, public client, and address. The private key MUST NOT leave the relayer module.

#### Scenario: Relayer initialized
- **WHEN** relayer-backed code requests the relayer
- **THEN** the system returns a viem account/wallet client whose address is derived from `EVM_SIGNER_PRIVATE_KEY` on the configured Mantle chain

#### Scenario: Missing private key
- **WHEN** relayer code runs without `EVM_SIGNER_PRIVATE_KEY` set
- **THEN** the system throws an error indicating `EVM_SIGNER_PRIVATE_KEY` is required

### Requirement: Relayer pays gas for execution transactions
The system SHALL broadcast execution-layer transactions through the relayer wallet, which signs and pays gas, and SHALL return the on-chain transaction hash after the receipt is confirmed.

#### Scenario: Transaction sent and confirmed
- **WHEN** `sendRelayerTransaction({ to, data, value })` is called
- **THEN** the relayer signs and broadcasts the transaction, waits for the receipt, and returns the transaction hash

#### Scenario: Value defaults to zero
- **WHEN** `sendRelayerTransaction` is called without a `value`
- **THEN** the transaction is sent with a value of 0

### Requirement: Server-wallet provisioning returns the relayer address
The system SHALL replace per-user Thirdweb server-wallet provisioning so that requesting a wallet for any identifier returns the shared relayer address without creating a managed wallet.

#### Scenario: Wallet requested for a user
- **WHEN** code that previously called `createServerWallet(identifier)` runs
- **THEN** the system returns the shared relayer address and provisions no external wallet

### Requirement: No Thirdweb dependency in execution
The system SHALL NOT import or invoke the `thirdweb` package for transaction execution. Trade and yield executors MUST route on-chain transactions through the relayer.

#### Scenario: Executors use the relayer
- **WHEN** `trade-executor.ts` or `yield-executor.ts` broadcasts a transaction
- **THEN** it calls the relayer send function and references no `thirdweb` symbol
