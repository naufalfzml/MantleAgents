## 1. Dependencies & env

- [x] 1.1 Add `siwe` and `jose` to `apps/api/package.json`; remove `thirdweb`
- [x] 1.2 Add `wagmi` (and ensure `viem`) to `apps/web/package.json`; remove `thirdweb`
- [x] 1.3 Update `apps/api/.env` and `.env.example`: remove `THIRDWEB_SECRET_KEY`, `THIRDWEB_ADMIN_PRIVATE_KEY`; add `JWT_SECRET`; keep `AUTH_DOMAIN`, `EVM_SIGNER_PRIVATE_KEY`
- [x] 1.4 Update `apps/web/.env` and `.env.local.example`: remove `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`; add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- [x] 1.5 Run `pnpm install` and confirm lockfile updates

## 2. API — relayer wallet

- [x] 2.1 Create `apps/api/src/lib/relayer.ts` with memoized `getRelayer()` (account, walletClient, publicClient, address) using `EVM_SIGNER_PRIVATE_KEY` + `chains.ts` Mantle config
- [x] 2.2 Implement `sendRelayerTransaction({ to, data, value })` → send + `waitForTransactionReceipt` → return tx hash
- [x] 2.3 Implement a `createServerWallet(identifier)` replacement that returns `{ address: relayerAddress }` (no external provisioning)
- [x] 2.4 Update `services/trade-executor.ts` to import the relayer and replace all `sendTransactionFromServerWallet(...)` calls
- [x] 2.5 Update `services/yield-executor.ts` likewise
- [x] 2.6 Update `routes/user.ts` and `routes/yield-agent.ts` to use the relayer `createServerWallet` replacement
- [x] 2.7 Delete `apps/api/src/lib/thirdweb-wallet.ts`

## 3. API — SIWE + JWT auth

- [x] 3.1 Create `apps/api/src/lib/auth.ts`: SIWE message builder (siwe, bound to `AUTH_DOMAIN` + nonce + expiry), verify helper, and JWT sign/verify with `jose` (`JWT_SECRET`, `sub = address`); fail-loud if `JWT_SECRET` unset
- [x] 3.2 Rewrite `routes/auth.ts`: `/api/auth/payload` builds SIWE message; `/api/auth/login` verifies + issues JWT; keep `/api/auth/me` and `/api/auth/logout` contracts unchanged
- [x] 3.3 Rewrite `middleware/auth.ts` to verify JWT with `jose` and set `request.user.walletAddress` from `sub`
- [x] 3.4 Delete `apps/api/src/lib/thirdweb.ts` and remove `thirdweb` imports from `routes/`, `test/setup.ts`, `scripts/migrate-8004-agent-uri.ts`, `services/uniswap-swap.ts` (replace with relayer where needed)

## 4. Web — wagmi config & providers

- [x] 4.1 Create `apps/web/src/lib/wagmi.ts`: `createConfig` with Mantle chain(s) + `injected`, `walletConnect`, `coinbaseWallet` connectors (WalletConnect gated on `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`)
- [x] 4.2 Rewrite `app/providers.tsx`: replace `ThirdwebProvider`/`AutoConnect` with `WagmiProvider`; keep `QueryClientProvider`
- [x] 4.3 Delete `apps/web/src/lib/thirdweb.ts`

## 5. Web — connect UI & auth provider

- [x] 5.1 Rewrite `components/wallet-connect.tsx` using wagmi `useConnect`/`useAccount`/`useSignMessage` + existing `lib/auth.ts` flow
- [x] 5.2 Rewrite `app/(marketing)/_components/connect-cta.tsx` to use the wagmi connect flow
- [x] 5.3 Update `providers/auth-provider.tsx`: swap `useActiveAccount`/`useActiveWalletConnectionStatus` for wagmi `useAccount` (address + status); preserve debounce, cross-tab sync, and session-check logic

## 6. Docs

- [x] 6.1 Update `README.md`, `AGENTS.md`, `CLAUDE.md` to drop Thirdweb references and document the relayer + SIWE/JWT + wagmi setup and new env vars

## 7. Verify

- [x] 7.1 `pnpm type-check` passes across all packages
- [x] 7.2 API auth + executor tests pass (`pnpm --filter @mantleagents/api test`); update any thirdweb mocks in `test/setup.ts`
- [x] 7.3 `grep -r thirdweb` across `apps/` returns no source references (only removed)
- [ ] 7.4 Manual smoke test: connect wallet → SIWE sign-in → `/api/auth/me` returns profile → trigger an agent run and confirm an on-chain tx broadcasts from the relayer
  - SIWE challenge → sign → verify → JWT issue/verify path verified programmatically (viem signer, checksum + bad-sig rejection). Browser wallet-connect + live on-chain relayer tx during an agent run remain a manual step (needs a funded relayer + running env).
