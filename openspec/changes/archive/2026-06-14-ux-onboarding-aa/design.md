## Context

The frontend already has:
- `(auth)/onboarding/page.tsx` — an onboarding page of unknown completeness (8.2 KB); needs a step indicator and faucet guidance layer added.
- `apps/api/src/lib/chains.ts` — exports `mantleExplorerTxUrl(txHash)` and `mantleExplorerAddressUrl(address)` helpers. These are already used server-side but never called in the frontend.
- `apps/api/src/lib/chain-client.ts` — exports a shared viem `PublicClient` for Mantle. A balance check endpoint can use `publicClient.getBalance({ address })`.
- `apps/api/src/routes/user.ts` — existing user routes including server wallet creation. Adding `GET /api/user/balance` here is natural.
- No `StatusBadge` component anywhere in `apps/web`. No explorer links anywhere in `apps/web`.

The AA / gasless analysis: thirdweb's SDK (already used for SIWE) supports ERC-4337 smart accounts and paymaster on Mantle. For the hackathon, we document this as a roadmap item rather than claiming it — consistent with the hygiene principle from Change 00. The README section will note: "Gasless UX for non-trading actions (publishing strategies, updating guardrails) is planned using thirdweb's smart account + paymaster on Mantle."

## Goals / Non-Goals

**Goals:**
- Step indicator driven by real state queries (balance check, agent registration status, guardrail config).
- `StatusBadge` reading RealClaw status from a lightweight API endpoint (not from env var directly in the browser — env vars stay server-side).
- Every tx hash in the UI links to the right explorer, using the correct network (testnet vs mainnet based on `MANTLE_NETWORK` env).
- README onboarding section completable by a non-Web3 user.

**Non-Goals:**
- Implementing AA / gasless (document roadmap only).
- Redesigning the auth flow or the existing onboarding page structure.
- Adding a full test suite to `apps/web` (add minimal Vitest config for the two new components only).

## Decisions

**D1 — Balance endpoint returns `{ balance: string, hasFunds: boolean, faucetUrl: string }`**
`GET /api/user/balance` reads the connected user's `walletAddress` from the JWT, calls `publicClient.getBalance({ address })`, formats it as a human-readable MNT string, and returns `hasFunds: balance > 0`. `faucetUrl` is hardcoded to `https://faucet.sepolia.mantle.xyz` (testnet) or omitted for mainnet. This is the data source for both the step indicator and the "Recheck balance" button.

**D2 — Step indicator state derived from multiple API calls at page load**
The 5 steps map to these data sources:
1. Connect Wallet — from thirdweb wallet connection state (client-side).
2. Fund — `GET /api/user/balance` → `hasFunds`.
3. Register Agent — `GET /api/agent/config` → `agent_8004_id` non-null.
4. Configure Guardrails — same agent config response, check that at least `maxValuePerTx` is set.
5. Start Agent — same config, check `is_active: true`.

All fetches run in parallel via TanStack Query on page load. The active step is the first one not yet complete.

**D3 — RealClaw status served from a lightweight `/api/system/status` endpoint**
To avoid exposing env vars to the browser, a new `GET /api/system/status` endpoint returns `{ realClawConfigured: boolean, network: 'testnet' | 'mainnet' }`. The `StatusBadge` component fetches this once on mount (cached by TanStack Query with a 5-minute stale time). No secrets are exposed — only a boolean.

**D4 — Explorer link consistency via a shared `useExplorerTxUrl(txHash)` hook**
A small `useExplorerTxUrl(txHash: string | null)` hook in `apps/web/src/lib/explorer.ts` calls the system status endpoint (or reads `NEXT_PUBLIC_MANTLE_NETWORK` if that env is exposed) to determine the correct explorer base URL and returns the full link. All components rendering tx hashes import this hook.

*Alternative*: Pass `NEXT_PUBLIC_MANTLE_EXPLORER_BASE_URL` as an env var. Simpler but requires an extra env var. The hook approach reuses the existing system status cache — preferred.

**D5 — `StatusBadge` is a pure presentational component with a data-fetching wrapper**
`StatusBadge` receives `{ realClawConfigured: boolean, custodyLabel: string }` as props. A `DashboardStatusBadges` wrapper component does the fetch via `useSystemStatus()` and renders `StatusBadge`. This separation makes the component testable without mocking network calls.

**D6 — AA/gasless documented in README as roadmap, not claimed**
The README "Onboarding" section includes a subsection "Roadmap: Gasless UX" describing the thirdweb smart account + Mantle paymaster option for non-trading actions. Phrasing: "Currently in scope for a future release. Trading transactions are already non-custodial via Privy/RealClaw; extending this to meta-transactions for configuration updates is the next step."

## Risks / Trade-offs

- **[`getBalance` on every /api/user/balance call]** → Mantle RPC call per request. Mitigated by TanStack Query client-side caching (5-minute stale time) so the RPC is only called once per user session, not on every render.
- **[Step indicator state staleness]** → Steps 3–5 read from the same agent config query. If the user completes a step in another tab, they need to manually recheck. Mitigation: add a "Refresh status" button alongside the step indicator; auto-refetch on window focus is sufficient for the demo.
- **[Onboarding page structure conflict]** → The existing `(auth)/onboarding/page.tsx` is 8.2 KB — its current structure is unknown. Mitigation: read the file before implementing; add the step indicator as a new component imported into the existing page rather than replacing the page structure.
