## ADDED Requirements

### Requirement: wagmi wallet connection configuration
The frontend SHALL configure wallet connection via wagmi + viem with the Mantle chain(s) and connectors for MetaMask (injected), WalletConnect, and Coinbase Wallet. WalletConnect SHALL use `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.

#### Scenario: Providers mount with wagmi
- **WHEN** the app renders its provider tree
- **THEN** a `WagmiProvider` wraps the app alongside the existing `QueryClientProvider`, with no `ThirdwebProvider`

#### Scenario: WalletConnect project id missing
- **WHEN** `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is not set
- **THEN** the WalletConnect connector is omitted while injected and Coinbase connectors remain available

### Requirement: Connect and authenticate flow
The frontend SHALL connect a wallet, request a SIWE payload from `/api/auth/payload`, sign it with the connected account, exchange it at `/api/auth/login` for a JWT, and update auth state via `handleLogin(jwt, address)`. The existing `lib/auth.ts` helpers MUST be reused unchanged.

#### Scenario: User connects and signs in
- **WHEN** a user triggers connect and signs the SIWE message
- **THEN** the frontend stores the returned JWT and marks the session authenticated with the connected address

#### Scenario: User rejects signature
- **WHEN** the user rejects the SIWE signature request
- **THEN** the frontend does not store a token and the session remains unauthenticated

### Requirement: Auth provider tracks wagmi account state
The auth provider SHALL derive connection state from wagmi (`useAccount` address/status) instead of Thirdweb hooks, preserving the existing debounced disconnect, cross-tab sync, and session-check behavior.

#### Scenario: Wallet disconnects
- **WHEN** the wagmi account transitions to disconnected after having been connected
- **THEN** the auth provider clears the stored token and resets auth state after the existing debounce window

#### Scenario: Session restored on reload
- **WHEN** the app reloads with wagmi reconnecting and a stored JWT present
- **THEN** the auth provider waits for the connection status to settle, then validates the session via `/api/auth/me`

### Requirement: No Thirdweb dependency in frontend
The frontend SHALL NOT import the `thirdweb` package. The `thirdweb` dependency is removed from `apps/web/package.json` and `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` is no longer used.

#### Scenario: Frontend builds without thirdweb
- **WHEN** the web app is type-checked and built
- **THEN** no module imports from `thirdweb` and the build succeeds without `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`
