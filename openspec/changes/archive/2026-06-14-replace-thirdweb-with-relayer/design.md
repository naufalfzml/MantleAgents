## Context

Thirdweb currently serves three roles in MantleAgents:

1. **Auth** (`apps/api/src/lib/thirdweb.ts`, `middleware/auth.ts`, `routes/auth.ts`): `createAuth()` issues a SIWE-style login payload, verifies the signed payload, and mints/validates a JWT whose `sub` is the wallet address. Requires `THIRDWEB_SECRET_KEY`, `THIRDWEB_ADMIN_PRIVATE_KEY`, `AUTH_DOMAIN`.
2. **Server wallets / gasless execution** (`apps/api/src/lib/thirdweb-wallet.ts`): `createServerWallet(identifier)` provisions a managed per-user wallet; `sendTransactionFromServerWallet()` broadcasts sponsored (EIP-7702) transactions where Thirdweb pays gas. Used by `trade-executor.ts`, `yield-executor.ts`, `routes/user.ts`, `routes/yield-agent.ts`. Defaults to BSC (`chainId 56`).
3. **Frontend connect** (`apps/web/src/lib/thirdweb.ts`, `app/providers.tsx`, `components/wallet-connect.tsx`, `app/(marketing)/_components/connect-cta.tsx`, `providers/auth-provider.tsx`): `ThirdwebProvider` + `ConnectButton`/`useConnectModal` drive wallet connection; `useActiveAccount`/`useActiveWalletConnectionStatus` feed the auth provider. The connect `auth` adapter calls our own `/api/auth/payload` → sign → `/api/auth/login` flow already.

Crucially, the codebase **already** runs a viem wallet from `EVM_SIGNER_PRIVATE_KEY` (`agent-registry.ts:getEvmWalletClient()`, `attestation-service.ts`) for ERC-8004 registration and attestation commits, paying its own gas on Mantle. The relayer pattern is proven; this change generalizes it and removes the paid vendor.

Thirdweb's gas sponsorship is billed and the managed server wallets are billed. We don't need per-user custody — a single relayer signing key already controls execution.

## Goals / Non-Goals

**Goals:**
- Remove the `thirdweb` package from `apps/api` and `apps/web` entirely.
- Preserve the existing HTTP contract of `/api/auth/payload`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` so the frontend `lib/auth.ts` surface is unchanged.
- Centralize one relayer wallet (`EVM_SIGNER_PRIVATE_KEY`) that pays gas for all execution-layer transactions, reusing the existing viem pattern.
- Keep the JWT `sub = walletAddress` claim so `middleware/auth.ts` and all `request.user.walletAddress` consumers keep working.
- Frontend connects via wagmi with MetaMask, WalletConnect, and Coinbase connectors.

**Non-Goals:**
- Multi-chain relayer routing. The relayer targets Mantle (per `chains.ts`). Legacy BSC default (`chainId 56`) in `thirdweb-wallet.ts` is dropped in favor of the Mantle chain config.
- Per-user custodial wallets or account abstraction. One shared relayer is sufficient.
- Token blacklist / server-side JWT revocation (logout stays client-side, as today).
- Changing the SIWE message UX or the onboarding flow.
- Rewriting `agent-registry.ts` / `attestation-service.ts` (already viem-native).

## Decisions

### 1. Auth: `siwe` + `jose` instead of Thirdweb Auth
- `POST /api/auth/payload`: build a SIWE message via the `siwe` library (`SiweMessage`) bound to `AUTH_DOMAIN`, a server-generated `nonce`, the requested `address`, chainId, and issuance/expiry timestamps. Return the prepared message fields (shape compatible with what the frontend signs).
- `POST /api/auth/login`: reconstruct the `SiweMessage` and call `.verify({ signature })`. On success, sign a JWT with `jose` (`SignJWT`, HS256) using `JWT_SECRET`, `sub = address`, short expiry (e.g. 7d). Return `{ token }`.
- `middleware/auth.ts`: verify with `jose.jwtVerify(jwt, secret)`; set `request.user.walletAddress = payload.sub`.
- **Nonce storage**: keep it simple and stateless to match current behavior — embed nonce + issuedAt in the signed SIWE message and rely on the signature + domain + expiry window for validity (no Supabase round-trip). The current Thirdweb flow is likewise effectively stateless from our side. *Alternative considered*: persist nonces in Supabase for strict single-use; rejected for now as over-engineering for a hackathon scope, noted as a hardening follow-up.
- *Why siwe + jose over rolling our own*: `siwe` handles EIP-4361 message formatting + EIP-1271/ECDSA verification correctly; `jose` is the standard for JWT. Both are free and dependency-light.

### 2. Relayer: one viem wallet from `EVM_SIGNER_PRIVATE_KEY`
- New `apps/api/src/lib/relayer.ts` exposes a memoized `getRelayer()` returning `{ account, walletClient, publicClient, address }` built with `privateKeyToAccount` + `createWalletClient`/`createPublicClient` over `mantleRpcUrl()` / `MANTLE_CHAIN` (from `chains.ts`).
- `sendRelayerTransaction({ to, data, value })`: `walletClient.sendTransaction(...)` then `publicClient.waitForTransactionReceipt(...)`, returning the tx hash. This is the drop-in replacement for `sendTransactionFromServerWallet(addr, tx)` — callers stop passing a per-user wallet address (or pass it and we ignore it during migration).
- `createServerWallet(identifier)` replacement returns `{ address: relayerAddress }` so `routes/user.ts` and `routes/yield-agent.ts` keep storing a wallet address against the user without provisioning anything. *Alternative considered*: deterministic per-user wallets via HD derivation from a master key — rejected because the relayer must hold gas funds anyway and per-user funding is operational overhead with no benefit here.
- *Gas*: the relayer wallet must be funded with MNT on Mantle (testnet faucet). This is the same wallet already used for registration/attestation, so it is already funded in dev.
- Keep the existing `signTransaction`-callback isolation pattern in `trade-executor.ts` where present; the relayer encapsulates the private key so it never leaves `relayer.ts`.

### 3. Frontend: wagmi + viem
- New `apps/web/src/lib/wagmi.ts`: `createConfig` with `mantleSepoliaTestnet`/`mantle` chains and connectors `injected()` (MetaMask), `walletConnect({ projectId })`, `coinbaseWallet()`. Uses `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- `app/providers.tsx`: replace `ThirdwebProvider`/`AutoConnect` with `WagmiProvider` (wagmi auto-reconnects via its own storage). Keep `QueryClientProvider` (wagmi requires it; already present).
- `components/wallet-connect.tsx` + `connect-cta.tsx`: replace `ConnectButton`/`useConnectModal` with wagmi `useConnect`/`useAccount`/`useSignMessage`. The connect handler: connect → request `/api/auth/payload` → `signMessage` the SIWE string → `/api/auth/login` → `handleLogin(jwt, address)`. The existing `lib/auth.ts` helpers (`generatePayload`, `login`, `checkSession`) are reused unchanged, so only the wallet adapter changes.
- `providers/auth-provider.tsx`: swap `useActiveAccount()` → wagmi `useAccount()` (`address`, `isConnected`, `status`), and `useActiveWalletConnectionStatus()` → wagmi `status` ('connecting'|'reconnecting'|'connected'|'disconnected'). The debounce/cross-tab/session logic is preserved; only the source hooks change.
- *Why wagmi over raw viem connectors*: wagmi provides battle-tested connector lifecycle, autoreconnect, and React hooks; the project already uses TanStack Query which wagmi builds on.

### 4. Env changes
- Remove: `THIRDWEB_SECRET_KEY`, `THIRDWEB_ADMIN_PRIVATE_KEY` (api); `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (web).
- Add: `JWT_SECRET` (api, required — fail-loud if unset); `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (web, required for WalletConnect connector).
- Keep: `AUTH_DOMAIN` (now used by `siwe`), `EVM_SIGNER_PRIVATE_KEY` (relayer).

## Risks / Trade-offs

- **Relayer is a single point of trust/failure** → Mitigation: same trust model already exists for registration/attestation; document that the relayer key must be funded and secured. Out of scope to add per-user custody.
- **Stateless nonce allows signature replay within the validity window** → Mitigation: short SIWE expiry + domain binding; flag Supabase-backed single-use nonces as a hardening follow-up.
- **JWT shape change could break existing stored tokens** → Mitigation: it's a hard cutover; existing Thirdweb JWTs become invalid, users re-login once. Acceptable (hackathon, no prod users).
- **wagmi SSR with Next 16 App Router** → Mitigation: wagmi config + provider live in a `'use client'` boundary (`providers.tsx` already client); use wagmi's cookie/localStorage storage; no server prerender of wallet state.
- **Chain mismatch**: legacy `thirdweb-wallet.ts` defaulted to BSC (56); relayer targets Mantle → this is a correctness *fix*, but verify no execution path actually depended on BSC. `trade-executor.ts`/`yield-executor.ts` are the Mantle/agent paths; confirm during apply.
- **WalletConnect requires a project ID** → Mitigation: free from WalletConnect Cloud; if unset, connector is omitted gracefully and injected/Coinbase still work.

## Migration Plan

1. API: add `relayer.ts` + `auth.ts` (siwe/jose) alongside existing files; switch `middleware/auth.ts`, `routes/auth.ts` to new auth; switch executors + `routes/user.ts`/`yield-agent.ts` to relayer.
2. Delete `lib/thirdweb.ts`, `lib/thirdweb-wallet.ts`; remove `thirdweb` from `apps/api/package.json`.
3. Web: add `wagmi.ts`; rewrite `providers.tsx`, `wallet-connect.tsx`, `connect-cta.tsx`, `auth-provider.tsx`; delete `lib/thirdweb.ts`; remove `thirdweb` from `apps/web/package.json`.
4. Update `.env`/`.env.example` files and docs.
5. `pnpm install`, `pnpm type-check`, run auth + executor tests, manual connect + agent-run smoke test.
6. **Rollback**: revert the change set; re-add `thirdweb` deps and the two env vars. No DB migration is required (wallet-address columns still hold an address — now the relayer's).

## Resolved Decisions (formerly open questions)

- **Per-user `wallet_address` / server-wallet column**: **Left as-is, no DB migration.** The column now stores the shared relayer address. Renaming would add migration churn with no behavioral benefit for the hackathon; the column still holds a valid address and all consumers keep working. Revisit only if per-user custody is reintroduced.
- **JWT expiry duration**: **7 days.** The JWT is signed with `jose` (HS256) using `JWT_SECRET` with a 7-day expiry, balancing session convenience against the stateless (non-revocable) logout model. Server-side revocation / shorter expiry is a hardening follow-up if needed.
