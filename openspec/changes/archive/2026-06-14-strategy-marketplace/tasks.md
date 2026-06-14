## 1. Database Migration

- [x] 1.1 Create migration: `strategy_templates` table (`id uuid pk`, `owner_wallet text`, `workflow_json jsonb`, `title text`, `description text`, `rental_price numeric`, `status text check ('draft','listed','delisted')`, `min_attestations_required int`, `created_at timestamptz`)
- [x] 1.2 Create migration: `strategy_performance_snapshots` table (`id uuid pk`, `strategy_id uuid references strategy_templates`, `period_start timestamptz`, `period_end timestamptz`, `roi_pct numeric`, `run_count int`, `attestation_ids text[]`, `created_at timestamptz`)
- [x] 1.3 Create migration: `strategy_rentals` table (`id uuid pk`, `strategy_id uuid references strategy_templates`, `renter_wallet text`, `price_paid numeric`, `platform_fee numeric`, `n8n_workflow_id text`, `started_at timestamptz`, `expires_at timestamptz`)
- [x] 1.4 Add RLS policy on `strategy_templates`: SELECT allows `owner_wallet = auth.uid()` OR `status = 'listed'`; INSERT/UPDATE/DELETE requires `owner_wallet = auth.uid()`
- [ ] 1.5 Apply all migrations locally; verify tables and RLS exist

## 2. Shared Types

- [x] 2.1 Add `StrategyTemplate`, `StrategyListing`, `StrategyRental`, `EligibilityResult` types to `packages/shared`
- [x] 2.2 Export all from `packages/shared/index.ts`
- [x] 2.3 Run `pnpm type-check` — exit 0

## 3. Strategy Eligibility Service

- [x] 3.1 Create `apps/api/src/services/strategy-eligibility.ts`
- [x] 3.2 Read `MIN_ATTESTATIONS_REQUIRED` (default 10) and `MIN_TRACK_RECORD_DAYS` (default 7) from env vars
- [x] 3.3 Implement `checkEligibility(walletAddress, agentType): EligibilityResult` — query `agent_attestations`, count rows, compute date span, compute `roi_pct`
- [x] 3.4 Return `{ eligible: false, issues: [...] }` when count or period checks fail; return `{ eligible: true, attestationCount, firstRunAt, lastRunAt, roiPct, issues: [] }` when both pass
- [x] 3.5 Ensure `roiPct` is always a finite number (default to 0 if no trade data)

## 4. Eligibility Service Tests

- [x] 4.1 Create `apps/api/src/services/strategy-eligibility.test.ts`
- [x] 4.2 Test: mock attestations below minimum count → `eligible: false`, issue mentions count
- [x] 4.3 Test: sufficient count but all within 1 day → `eligible: false`, issue mentions period
- [x] 4.4 Test: sufficient count + 10-day spread → `eligible: true`, correct `attestationCount`, `firstRunAt`, `lastRunAt`
- [x] 4.5 Test: `roiPct` is finite number regardless of data shape
- [x] 4.6 Test: `MIN_ATTESTATIONS_REQUIRED=3` env override respected
- [x] 4.7 Run `cd apps/api && pnpm vitest run src/services/strategy-eligibility.test.ts` — all green

## 5. Strategy Clone Service

- [x] 5.1 Create `apps/api/src/services/strategy-clone.ts`
- [x] 5.2 Implement `cloneStrategyToCanvas(renterWallet, workflowJson, strategyTitle)`: call `provisionUserWorkflow` from Change 04's `n8n-provisioner.ts` with the provided `workflowJson`
- [x] 5.3 Prefix cloned workflow name with strategy title (e.g. `"[${strategyTitle}] fx-agent-<renterWallet>"`)
- [x] 5.4 Return the n8n `workflowId` on success; throw a descriptive error on n8n API failure

## 6. Marketplace Route Plugin

- [x] 6.1 Create `apps/api/src/routes/marketplace.ts` as a Fastify plugin
- [x] 6.2 Implement `POST /marketplace/strategies`: auth required; run `checkEligibility`; return 422 + issues if ineligible; else insert `strategy_templates` (status: listed) + `strategy_performance_snapshots`; return created row
- [x] 6.3 Implement `GET /marketplace/strategies`: no auth required; query `strategy_templates WHERE status = 'listed'`; join latest snapshot for ROI/period; return array of `StrategyListing`
- [x] 6.4 Implement `GET /marketplace/strategies/:id`: return full strategy detail including all associated `agent_attestations` explorer links for the owner wallet/agent type
- [x] 6.5 Implement `POST /marketplace/strategies/:id/rent`: auth required; reject if renter = owner (400); call `cloneStrategyToCanvas`; on success insert `strategy_rentals` row with `platform_fee`; return rental confirmation + `n8n_workflow_id`
- [x] 6.6 Add `PLATFORM_TAKE_RATE_PCT` env var (default 5); compute `platform_fee = rental_price * rate / 100`
- [x] 6.7 Register marketplace plugin in `apps/api/src/index.ts`

## 7. Marketplace Route Tests

- [x] 7.1 Create `apps/api/src/routes/marketplace.test.ts`
- [x] 7.2 Test: `POST /marketplace/strategies` ineligible → 422 + issues, no listed row created
- [x] 7.3 Test: `POST /marketplace/strategies` eligible (mock `checkEligibility`) → `status: listed` row + snapshot row
- [x] 7.4 Test: `GET /marketplace/strategies` → only `status: listed` rows returned, including from other users
- [x] 7.5 Test: `POST /marketplace/strategies/:id/rent` success path — mock `cloneStrategyToCanvas`; verify called with correct `workflow_json`; verify `strategy_rentals` row inserted
- [x] 7.6 Test: rent own strategy → 400
- [x] 7.7 Test: rent delisted strategy → 404
- [x] 7.8 Test: `cloneStrategyToCanvas` throws → rent endpoint returns 5xx, no rental row inserted
- [x] 7.9 Run `cd apps/api && pnpm vitest run src/routes/marketplace.test.ts` — all green

## 8. RLS Tests

- [ ] 8.1 Write a Supabase test (using test client with User B's JWT) that attempts `UPDATE strategy_templates` owned by User A → must return 0 rows affected
- [ ] 8.2 Write test: User B selects `strategy_templates WHERE status = 'draft' AND owner_wallet = User A` → must return empty result
- [ ] 8.3 Run RLS tests manually or in CI with a test Supabase project

## 9. UI — /marketplace Listing and Detail Pages

- [x] 9.1 Create `apps/web/src/app/(app)/marketplace/page.tsx` — fetch `GET /marketplace/strategies` via TanStack Query; render grid of strategy cards
- [x] 9.2 Each card: title, truncated `owner_wallet`, ROI badge, run count, date range, rental price, "On-chain Verified" badge, "View Details" link
- [x] 9.3 Create `apps/web/src/app/(app)/marketplace/[id]/page.tsx` — fetch strategy detail; render full performance metrics + individual attestation links
- [x] 9.4 For each attestation: render clickable Mantle explorer link using `commitTxExplorerUrl`; show "not yet on-chain" label for null `commit_tx_hash`
- [x] 9.5 Add "Past performance is not indicative of future results." disclaimer above the performance metrics (above the fold on desktop)
- [x] 9.6 Add "Rent Strategy" button (hidden for strategy owner); on click call `POST /marketplace/strategies/:id/rent`; show loading state; on success show confirmation + link to `/orchestration`
- [x] 9.7 Create `apps/web/src/app/(app)/marketplace/publish/page.tsx` — form for publishing a strategy; on load fetch eligibility status and display it; on submit call `POST /marketplace/strategies`; show validation issues if 422

## 10. Navigation

- [x] 10.1 Add "Marketplace" link to the app sidebar/nav
- [x] 10.2 Add "Publish Strategy" link or button on the agent overview or marketplace page

## 11. Manual Demo Verification

- [ ] 11.1 Run agent (with `MIN_ATTESTATIONS_REQUIRED=3`, `MIN_TRACK_RECORD_DAYS=1` in demo env) until 3+ attested runs exist
- [ ] 11.2 Open publish form → verify eligibility check shows "eligible" with correct stats
- [ ] 11.3 Publish strategy → verify it appears on `/marketplace` with "On-chain Verified" badge and correct ROI/period
- [ ] 11.4 Click through to detail page → verify attestation links open Mantle Sepolia explorer
- [ ] 11.5 Login as second test wallet → rent the strategy → verify workflow appears in `/orchestration` canvas
- [ ] 11.6 Try publishing a strategy with only 1 run → verify 422 error with clear eligibility message
- [ ] 11.7 Verify disclaimer text present on both listing card and detail page

## 12. Cleanup

- [x] 12.1 Add `MIN_ATTESTATIONS_REQUIRED`, `MIN_TRACK_RECORD_DAYS`, `PLATFORM_TAKE_RATE_PCT` to `apps/api/.env.example`
- [x] 12.2 Run `pnpm type-check` — exit 0
- [x] 12.3 Run `pnpm --filter @mantleagents/web build` — exit 0
