## ADDED Requirements

### Requirement: GET /api/system/status returns RealClaw and network configuration
The `GET /api/system/status` endpoint SHALL be publicly accessible (no auth required) and return `{ realClawConfigured: boolean, network: 'testnet' | 'mainnet' }`. `realClawConfigured` MUST reflect the result of `isRealClawConfigured()` from Change 01. No env var values or secrets MUST be included in the response.

#### Scenario: Returns realClawConfigured true when env vars are set
- **WHEN** `REALCLAW_API_KEY` and `REALCLAW_API_BASE` are both set
- **THEN** `GET /api/system/status` MUST return `{ realClawConfigured: true, ... }`

#### Scenario: Returns realClawConfigured false when API key is missing
- **WHEN** `REALCLAW_API_KEY` is unset
- **THEN** `GET /api/system/status` MUST return `{ realClawConfigured: false, ... }`

### Requirement: StatusBadge component renders RealClaw and custody status
The `StatusBadge` component SHALL render two badges: (1) RealClaw connection status — "RealClaw Connected" (green) when `realClawConfigured: true`, "RealClaw Not Configured" (amber warning) when false; (2) Custody model — always shows "Non-custodial via Privy/RealClaw" (neutral informational). Both badges MUST be visible in the dashboard without scrolling.

#### Scenario: Connected badge shows green styling
- **WHEN** `StatusBadge` is rendered with `realClawConfigured: true`
- **THEN** the RealClaw badge MUST render with a green or success colour variant and text "RealClaw Connected"

#### Scenario: Not configured badge shows warning styling
- **WHEN** `StatusBadge` is rendered with `realClawConfigured: false`
- **THEN** the RealClaw badge MUST render with an amber or warning colour variant and text "RealClaw Not Configured"

#### Scenario: Custody badge always present regardless of RealClaw status
- **WHEN** `StatusBadge` is rendered with any `realClawConfigured` value
- **THEN** a badge with text matching "Non-custodial" MUST always be visible

### Requirement: StatusBadge displayed in the dashboard layout header or sidebar
The `DashboardStatusBadges` wrapper component SHALL be added to the authenticated app layout (`apps/web/src/app/(app)/layout.tsx` or equivalent) so it is visible on all dashboard pages, not only on a specific page.

#### Scenario: Status badges visible on agent overview page
- **WHEN** a user navigates to `/overview`
- **THEN** the RealClaw and custody badges MUST be visible without navigating to a settings or status page

### Requirement: System status is cached client-side with a 5-minute stale time
The `DashboardStatusBadges` component SHALL use TanStack Query with `staleTime: 5 * 60 * 1000` to cache the system status response. The `/api/system/status` endpoint MUST NOT be called more than once per 5-minute window in a single browser session.

#### Scenario: Status not re-fetched on navigation between dashboard pages
- **WHEN** a user navigates between `/overview` and `/fx-agent` within 5 minutes
- **THEN** `GET /api/system/status` MUST NOT be called again (served from TanStack Query cache)
