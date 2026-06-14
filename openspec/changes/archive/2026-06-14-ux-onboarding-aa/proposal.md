## Why

The UX/onboarding dimension is 5 points and affects every judge's first impression of the demo. The core functionality built across Changes 00–06 is invisible to a first-time user without guidance: they see no indication of whether RealClaw is connected, what the custody model is, or how to link a timeline entry to an on-chain transaction. All three gaps are straightforward UI additions that are independent of the other changes and can be done at any time.

## What Changes

- Extend the existing `(auth)/onboarding` page with a 5-step indicator (Connect Wallet → Fund → Register Agent → Configure Guardrails → Start Agent), an in-app faucet guide, and a "Recheck balance" button backed by a new API endpoint.
- Add a `StatusBadge` component shown persistently in the dashboard header/sidebar displaying RealClaw connection status and custody model ("Non-custodial via Privy/RealClaw").
- Audit every place in `apps/web` that renders a tx hash and ensure it links to `mantleExplorerTxUrl()` from `chains.ts` — currently zero locations do this.
- Add a README "Onboarding" section with step-by-step instructions for a first-time Web3 user.
- Document AA/gasless as a roadmap item (not claimed as implemented) with a short analysis of the available options via thirdweb's AA SDK on Mantle.

## Capabilities

### New Capabilities

- `onboarding-step-indicator`: A 5-step progress indicator on the onboarding page that reflects the user's real state (wallet connected, balance > 0, agent registered, guardrails configured, agent started) with an in-app faucet link and balance recheck.
- `dashboard-status-badges`: A `StatusBadge` component showing RealClaw connection status and custody model, displayed in the dashboard header and visible without navigating anywhere.
- `explorer-link-consistency`: All tx hashes in the web app (timeline events, attestations, marketplace rental confirmations) link to the correct Mantle Sepolia or mainnet explorer URL.

### Modified Capabilities

*(none — auth flow and backend are unchanged; only UI additions and one new API endpoint)*

## Impact

- `apps/web/src/app/(auth)/onboarding/` — step indicator + faucet guide added to existing page
- `apps/web/src/components/status-badge.tsx` — new shared component
- `apps/web/src/app/(app)/` — `StatusBadge` added to dashboard layout header/sidebar
- All `apps/web` components that render `tx_hash` or `txHash` — explorer link added
- `apps/api/src/routes/user.ts` — `GET /api/user/balance` endpoint added
- `README.md` — "Onboarding" section added; "Roadmap: Account Abstraction" note added
- No changes to auth logic, agent-cron, or any backend service
