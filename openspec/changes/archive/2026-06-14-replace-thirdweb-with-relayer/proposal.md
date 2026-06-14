## Why

Thirdweb is a paid dependency. We originally adopted it for gasless (sponsored) transactions, SIWE auth + JWT, and frontend wallet connection — but the gas sponsorship and managed server wallets are billed, and the project does not need a third-party relayer. The codebase already runs a viem wallet backed by `EVM_SIGNER_PRIVATE_KEY` for ERC-8004 registration and attestation commits, so we can self-host the same pattern: one relayer wallet pays gas for all on-chain transactions, and auth becomes plain SIWE + JWT with no vendor.

## What Changes

- **BREAKING**: Remove the Thirdweb SDK from both `apps/api` and `apps/web`.
- Replace Thirdweb Auth (`generatePayload` / `verifyPayload` / `generateJWT` / `verifyJWT`) with the `siwe` library for challenge/verify and `jose` for JWT sign/verify.
- Replace Thirdweb managed server wallets and `sendTransactionFromServerWallet` (sponsored EIP-7702 tx) with a single **relayer wallet** derived from `EVM_SIGNER_PRIVATE_KEY` via viem. The relayer pays gas for all execution-layer transactions; per-user server wallets are no longer created.
- Replace `ThirdwebProvider` / `useActiveAccount` / Thirdweb `ConnectButton` + `useConnectModal` on the frontend with **wagmi + viem** connectors (MetaMask, WalletConnect, Coinbase).
- Remove env vars: `THIRDWEB_SECRET_KEY`, `THIRDWEB_ADMIN_PRIVATE_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`. Repurpose `AUTH_DOMAIN` for SIWE domain binding and add `JWT_SECRET` for token signing. Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` for wagmi WalletConnect.
- **BREAKING (data model)**: User/agent execution wallet is now the shared relayer address instead of a per-user Thirdweb server wallet address. Existing `createServerWallet` call sites in `routes/user.ts` and `routes/yield-agent.ts` return the relayer address.

## Capabilities

### New Capabilities
- `siwe-jwt-auth`: SIWE challenge generation, signature verification, and JWT issuance/verification using `siwe` + `jose`, replacing Thirdweb Auth across the `/api/auth/*` routes and the auth middleware.
- `relayer-wallet`: A single self-hosted relayer wallet (from `EVM_SIGNER_PRIVATE_KEY`) that signs and broadcasts all execution-layer transactions via viem and pays their gas, replacing Thirdweb managed/sponsored server wallets.
- `wagmi-wallet-connect`: Frontend wallet connection and session wiring via wagmi + viem connectors, replacing the Thirdweb provider, connect button, and connect-modal hook.

### Modified Capabilities
- (none — no existing OpenSpec specs in `openspec/specs/`; external behavior of `/api/auth/*` and the connect flow is preserved)

## Impact

- **API (`apps/api`)**:
  - Rewrite: `src/lib/thirdweb.ts` → `src/lib/auth.ts` (siwe + jose); `src/lib/thirdweb-wallet.ts` → `src/lib/relayer.ts` (viem relayer).
  - Edit: `src/middleware/auth.ts`, `src/routes/auth.ts`, `src/routes/user.ts`, `src/routes/yield-agent.ts`, `src/services/trade-executor.ts`, `src/services/yield-executor.ts`.
  - Unaffected: `src/services/agent-registry.ts`, `src/services/attestation-service.ts` already use viem + `EVM_SIGNER_PRIVATE_KEY` (no Thirdweb).
- **Web (`apps/web`)**:
  - Rewrite: `src/lib/thirdweb.ts` → `src/lib/wagmi.ts`; `src/app/providers.tsx`; `src/components/wallet-connect.tsx`; `src/app/(marketing)/_components/connect-cta.tsx`.
  - Edit: `src/providers/auth-provider.tsx` (swap `useActiveAccount`/`useActiveWalletConnectionStatus` for wagmi `useAccount`); `src/lib/auth.ts` stays (API surface unchanged).
- **Dependencies**: remove `thirdweb` from both apps; add `siwe`, `jose` (api) and `wagmi`, `viem`, `@tanstack/react-query` (web — query already present).
- **Env**: remove `THIRDWEB_SECRET_KEY`, `THIRDWEB_ADMIN_PRIVATE_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`; add `JWT_SECRET`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; keep `AUTH_DOMAIN`, `EVM_SIGNER_PRIVATE_KEY`.
- **Docs**: `README.md`, `AGENTS.md`, `CLAUDE.md`, `apps/api/.env.example`, `apps/web/.env.local.example` reference Thirdweb env vars.
