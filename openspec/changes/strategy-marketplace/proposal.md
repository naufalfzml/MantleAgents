## Why

A strategy marketplace turns MantleAgents into a platform with a network effect and a revenue model, but three design risks — distributed alpha killing returns, survivorship bias from short winning streaks, and pump-and-dump vectors — make a naive marketplace actively harmful. The key insight from the project review is that listing eligibility gated on verified on-chain attestation data (Change 02) both mitigates all three risks and is the strongest differentiator to present to judges: trust comes from on-chain track record, not seller claims.

## What Changes

- Supabase migration: three new tables — `strategy_templates` (the listed workflow + metadata), `strategy_performance_snapshots` (ROI/run aggregation from `agent_attestations`), `strategy_rentals` (who rented what, when, at what price).
- New `apps/api/src/services/strategy-eligibility.ts`: computes `attestation_count`, track record date range, and aggregate ROI from `agent_attestations`; returns `eligible: boolean` plus the reason when false.
- New `apps/api/src/routes/marketplace.ts`: three endpoints — `POST /marketplace/strategies` (publish with eligibility gate), `GET /marketplace/strategies` (public listing, `status: listed` only), `POST /marketplace/strategies/:id/rent` (clone workflow to renter's n8n canvas via Change 04 API).
- New `apps/api/src/services/strategy-clone.ts`: wraps the n8n workflow import call from Change 04 to copy a `workflow_json` into the renter's n8n instance.
- New `/marketplace` page in `apps/web`: grid of listing cards showing ROI, run count, date range, "On-chain Verified" badge, and mandatory "past performance ≠ future results" disclaimer; detail page links to every individual attestation.
- RLS policies: owner can write their own templates; only `status: listed` rows are public-readable.

## Capabilities

### New Capabilities

- `strategy-listing-eligibility`: Eligibility computation from `agent_attestations` enforcing minimum run count and minimum track record period; blocks publication of unverified strategies.
- `strategy-marketplace-api`: REST endpoints for publish (with eligibility gate), list (public, filtered), and rent (workflow clone + rental record).
- `strategy-clone-to-canvas`: Service that clones a strategy's `workflow_json` into the renting user's n8n canvas via the n8n provisioning API from Change 04.
- `marketplace-ui`: `/marketplace` listing and detail pages with on-chain verified badges, performance disclosure, attestation links, and rent flow.

### Modified Capabilities

*(none — Change 02 attestation data is read-only here; Change 04 n8n API is consumed but not modified)*

## Impact

- `supabase/migrations/` — three new tables + RLS policies
- `apps/api/src/services/strategy-eligibility.ts` — new service
- `apps/api/src/services/strategy-clone.ts` — new service
- `apps/api/src/routes/marketplace.ts` — new route plugin
- `apps/api/src/services/strategy-eligibility.test.ts` — new tests
- `apps/api/src/routes/marketplace.test.ts` — new tests
- `apps/web/src/app/(app)/marketplace/` — new pages (listing + detail)
- `packages/shared` — `StrategyTemplate`, `StrategyListing`, `StrategyRental` types
- Depends on Change 02 (`agent_attestations` with `commit_tx_hash`) and Change 04 (`strategy-clone` uses n8n import API)
