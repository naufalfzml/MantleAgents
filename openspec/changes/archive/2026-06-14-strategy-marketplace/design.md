## Context

`agent_attestations` (Change 02) stores one row per agent run, with `wallet_address`, `agent_type`, `run_id`, `payload` (jsonb containing `eventsHash`, `decisionHash`, `tradeCount`), `commit_tx_hash`, and `created_at`. This is the ground truth for track record data — it is on-chain anchored and independently verifiable.

The n8n workflow clone path from Change 04 (`n8n-provisioner.ts`) already knows how to POST a workflow JSON to the n8n REST API for a given user. `strategy-clone.ts` is a thin wrapper that takes a `workflow_json` and a `renter_wallet` and calls that path.

Three marketplace anti-patterns from the review drive the design constraints:
1. **Distributed alpha**: mitigated by surfacing slippage risk in the disclosure (future work to add a liquidity cap warning, out of scope for MVP).
2. **Survivorship bias**: mitigated by requiring a minimum *period* (≥ 7 days), not just a minimum *count*, so a "lucky streak" in one day can't qualify.
3. **Pump-and-dump**: mitigated by linking to every individual on-chain attestation (not just aggregates), so buyers can inspect the actual trades.

## Goals / Non-Goals

**Goals:**
- Eligibility enforced server-side: `attestation_count >= MIN_ATTESTATIONS` AND `date_range >= MIN_DAYS` before status can be `listed`.
- Every listing card and detail page shows the mandatory disclaimer.
- Rent clones the workflow to the renter's n8n canvas and records the rental.
- RLS prevents cross-user writes and hides `draft`/`delisted` rows from public queries.

**Non-Goals:**
- On-chain payment settlement (mUSDC transfer for demo is manual/out-of-scope).
- User-to-user reviews and ratings.
- Slippage / liquidity cap warnings in listing cards (future work, noted in README).
- Automated ROI recalculation (snapshots are computed at publish time and refreshed on demand, not on a cron).

## Decisions

**D1 — Eligibility is computed at publish time and stored in `strategy_templates`**
`POST /marketplace/strategies` runs `checkEligibility(walletAddress, agentType)` which queries `agent_attestations` and returns `{ eligible, attestationCount, firstRunAt, lastRunAt, roiPct, issues }`. If `eligible: false`, the request is rejected with a 422 and the `issues` array. If eligible, the computed snapshot values are written to both `strategy_templates` and a `strategy_performance_snapshots` row.

*Alternative*: Check eligibility lazily at list time. Rejected because it allows a seller to publish a draft and list it before the check runs, creating a window for ineligible listings.

**D2 — `strategy_performance_snapshots` is append-only; one snapshot per publish attempt**
Each time a strategy is published (or re-published after delisting), a new snapshot row is created capturing the attestation data at that moment. Historical snapshots are preserved. This means the listing card shows "performance as of publish date", not a live-recalculated number — which is honest and avoids gaming via real-time window-shopping.

**D3 — `strategy_rentals` records the rental with a `platform_fee` field; no on-chain settlement**
`platform_fee` is computed as `rental_price * PLATFORM_TAKE_RATE_PCT / 100` and stored in the row. For the hackathon demo, payment is acknowledged (recorded) but not transferred on-chain. The field exists for a future payment layer.

**D4 — Strategy clone uses Change 04's n8n provisioning path unchanged**
`strategy-clone.ts` calls `provisionUserWorkflow(renterWallet, workflowJson)` (from Change 04's `n8n-provisioner.ts`) with the strategy's `workflow_json`. The renter's n8n canvas gets the cloned workflow. No new n8n API surface is needed.

**D5 — Individual attestation links use `mantleExplorerTxUrl(commitTxHash)` from `chains.ts`**
The listing detail page fetches attestation rows for the strategy's owner wallet and agent type, extracts `commit_tx_hash` from each, and renders a link via the existing `mantleExplorerTxUrl()` helper. This is the concrete anti-survivorship-bias mechanism — judges and buyers can click through to every single run.

**D6 — Configurable thresholds via env vars with sensible defaults**
`MIN_ATTESTATIONS_REQUIRED` (default 10) and `MIN_TRACK_RECORD_DAYS` (default 7) are read from env vars so the hackathon demo can use lower values (e.g. 3 and 1) without code changes.

**D7 — RLS: owner can write; public can read `listed` only**
Supabase RLS policy on `strategy_templates`:
- SELECT: `auth.uid()` matches `owner_wallet` OR `status = 'listed'`
- INSERT/UPDATE/DELETE: `auth.uid()` matches `owner_wallet`

The `agent_attestations` table from Change 02 is read by the eligibility service using the service role key (bypasses RLS, controlled server-side), not exposed to the client.

## Risks / Trade-offs

- **[ROI calculation accuracy]** → ROI is approximated from `tradeCount` and attestation payloads, not from actual portfolio P&L. For MVP, display as "estimated ROI based on attested trade events" with a tooltip clarifying methodology. Accurate P&L requires wallet balance tracking across runs — future work.
- **[Eligibility window gaming]** → A seller could run an agent 10 times over 7 days on favourable conditions, qualify, then delist after the market turns. Mitigation: `strategy_performance_snapshots` preserves the *published* snapshot; buyers see the exact period and can verify on-chain. A "last updated" timestamp is shown so staleness is visible.
- **[n8n clone for renter requires renter to have n8n provisioned]** → If the renter has never opened `/orchestration` (Change 04), their n8n instance may not exist yet. Mitigation: `strategy-clone.ts` calls `provisionUserWorkflow` which already handles the case of no existing workflow (it provisions on first call).
- **[`workflow_json` stored in DB is the full n8n export]** → This may be large (10–50 KB). Mitigation: store as `jsonb` in Postgres (efficient binary storage); add a `content_hash` for integrity verification if needed later.
