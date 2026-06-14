## ADDED Requirements

### Requirement: POST /marketplace/strategies gates on eligibility check
`POST /marketplace/strategies` SHALL accept `{ title, description, workflow_json, rental_price, agent_type }` from an authenticated user, run `checkEligibility`, and return HTTP 422 with the `issues` array if not eligible. If eligible, it MUST create a `strategy_templates` row with `status: 'listed'` and a corresponding `strategy_performance_snapshots` row.

#### Scenario: Ineligible strategy publish returns 422 with issues
- **WHEN** `POST /marketplace/strategies` is called for a wallet with fewer runs than the minimum
- **THEN** the response MUST be HTTP 422 with a body containing the eligibility `issues` array and NO row MUST be inserted with `status: 'listed'`

#### Scenario: Eligible strategy publish creates listed row and snapshot
- **WHEN** eligibility passes
- **THEN** a `strategy_templates` row MUST exist with `status: 'listed'`, and a `strategy_performance_snapshots` row MUST be created with `attestation_count`, `roi_pct`, `period_start`, `period_end`

#### Scenario: Unauthenticated publish returns 401
- **WHEN** `POST /marketplace/strategies` is called without a valid session JWT
- **THEN** the response MUST be HTTP 401

### Requirement: GET /marketplace/strategies returns only listed strategies
`GET /marketplace/strategies` SHALL be publicly accessible (no auth required) and MUST return only rows with `status: 'listed'`. Each item MUST include `id`, `title`, `description`, `rental_price`, `owner_wallet` (truncated), `attestation_count`, `roi_pct`, `period_start`, `period_end`. Rows with `status: 'draft'` or `status: 'delisted'` MUST NOT appear.

#### Scenario: Listing endpoint excludes drafts and delisted
- **WHEN** `GET /marketplace/strategies` is called
- **THEN** all returned items MUST have `status: 'listed'`; no `draft` or `delisted` rows MUST appear

#### Scenario: Listed strategies from other users are visible
- **WHEN** User B calls `GET /marketplace/strategies`
- **THEN** strategies published by User A with `status: 'listed'` MUST appear in the response

### Requirement: POST /marketplace/strategies/:id/rent clones workflow and records rental
`POST /marketplace/strategies/:id/rent` SHALL verify the authenticated renter is not the strategy owner, call `strategy-clone.ts` to import `workflow_json` into the renter's n8n canvas, and insert a `strategy_rentals` row with `renter_wallet`, `price_paid`, `platform_fee`, and `started_at`. On success it MUST return the rental ID and confirmation.

#### Scenario: Successful rent clones workflow and creates rental row
- **WHEN** an authenticated user rents a listed strategy
- **THEN** `strategy-clone.ts` MUST be called with the strategy's `workflow_json` and the renter's `walletAddress`, AND a `strategy_rentals` row MUST be inserted

#### Scenario: Strategy owner cannot rent their own strategy
- **WHEN** the renter's `walletAddress` matches the strategy's `owner_wallet`
- **THEN** the response MUST be HTTP 400 with an error message; no rental row MUST be created

#### Scenario: Renting a non-listed strategy returns 404
- **WHEN** `POST /marketplace/strategies/:id/rent` targets a strategy with `status: 'draft'` or `'delisted'`
- **THEN** the response MUST be HTTP 404

### Requirement: RLS prevents cross-user writes on strategy_templates
Supabase RLS policy on `strategy_templates` SHALL allow INSERT/UPDATE/DELETE only when `auth.uid()` matches `owner_wallet`. SELECT of rows with `status != 'listed'` SHALL be restricted to the owner.

#### Scenario: User B cannot update User A's strategy
- **WHEN** a Supabase query with User B's JWT attempts to UPDATE a `strategy_templates` row owned by User A
- **THEN** the query MUST be rejected by RLS with zero rows affected

#### Scenario: User B cannot read User A's draft strategy
- **WHEN** a Supabase query with User B's JWT selects `strategy_templates` filtering by User A's wallet and `status: 'draft'`
- **THEN** the result MUST be empty (zero rows)
