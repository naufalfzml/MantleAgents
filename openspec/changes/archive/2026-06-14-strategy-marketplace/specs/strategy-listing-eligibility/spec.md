## ADDED Requirements

### Requirement: checkEligibility enforces minimum attestation count
`checkEligibility(walletAddress, agentType)` in `strategy-eligibility.ts` SHALL query `agent_attestations` and return `eligible: false` with `reason: 'insufficient track record'` when the count of attestation rows for that wallet/agent is below `MIN_ATTESTATIONS_REQUIRED` (env var, default 10).

#### Scenario: Below minimum run count returns ineligible
- **WHEN** `checkEligibility` is called for a wallet with fewer runs than `MIN_ATTESTATIONS_REQUIRED`
- **THEN** the result MUST be `{ eligible: false, issues: ['insufficient track record: X runs, need Y'] }`

#### Scenario: At or above minimum run count passes this rule
- **WHEN** the attestation count equals or exceeds `MIN_ATTESTATIONS_REQUIRED`
- **THEN** this specific check MUST NOT add an issue

### Requirement: checkEligibility enforces minimum track record period
Even when attestation count is sufficient, `checkEligibility` SHALL return `eligible: false` with `reason: 'track record period too short'` if the span from the earliest to the latest attestation `created_at` is less than `MIN_TRACK_RECORD_DAYS` (env var, default 7).

#### Scenario: All runs within one day returns ineligible
- **WHEN** `MIN_ATTESTATIONS_REQUIRED` is satisfied but all attestation rows have `created_at` within a 24-hour window
- **THEN** the result MUST be `{ eligible: false, issues: ['track record period too short: X days, need Y'] }`

#### Scenario: Runs spread over minimum period passes this rule
- **WHEN** attestation rows span at least `MIN_TRACK_RECORD_DAYS` days
- **THEN** this check MUST NOT add an issue

### Requirement: checkEligibility computes aggregate ROI and run stats when eligible
When both count and period checks pass, `checkEligibility` SHALL return `{ eligible: true, attestationCount, firstRunAt, lastRunAt, roiPct, issues: [] }`. `roiPct` SHALL be computed from the sum of trade outcomes across all attested runs (approximation from `payload.tradeCount` and available P&L data).

#### Scenario: Eligible result includes correct stats
- **WHEN** `checkEligibility` is called with 12 attestations spanning 10 days
- **THEN** the result MUST include `eligible: true`, `attestationCount: 12`, and non-null `firstRunAt` and `lastRunAt`

#### Scenario: roiPct is a finite number, not NaN or undefined
- **WHEN** `checkEligibility` returns `eligible: true`
- **THEN** `roiPct` MUST be a finite number (computed from available data or 0 if no P&L data is present)

### Requirement: Eligibility thresholds configurable via environment variables
`MIN_ATTESTATIONS_REQUIRED` and `MIN_TRACK_RECORD_DAYS` SHALL be read from environment variables at runtime, allowing demo environments to use lower thresholds without code changes.

#### Scenario: Environment override respected
- **WHEN** `MIN_ATTESTATIONS_REQUIRED=3` is set in the environment
- **THEN** `checkEligibility` MUST use 3 as the threshold, not the default 10
