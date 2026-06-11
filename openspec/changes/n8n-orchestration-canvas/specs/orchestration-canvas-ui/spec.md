## ADDED Requirements

### Requirement: /orchestration page renders an embedded n8n editor for the logged-in user
The `apps/web` route `/orchestration` SHALL render an iframe embedding the n8n editor pointed at the logged-in user's workflow. The page MUST be accessible only to authenticated users (protected by the existing `(app)` route group auth).

#### Scenario: Authenticated user sees n8n canvas
- **WHEN** a logged-in user navigates to `/orchestration`
- **THEN** the page MUST render an iframe whose `src` resolves to the n8n editor URL for that user's provisioned workflow

#### Scenario: Unauthenticated access redirects to login
- **WHEN** an unauthenticated visitor navigates to `/orchestration`
- **THEN** they MUST be redirected to the login page (same behaviour as other `(app)` routes)

### Requirement: n8n iframe src includes user-scoped session token
The `/orchestration` page SHALL generate a short-lived token (signed JWT, max 5-minute TTL) from the user's `walletAddress` and append it to the n8n iframe `src` as a query parameter, enabling the n8n instance to identify the user's session.

#### Scenario: iframe src contains token query param
- **WHEN** the `/orchestration` page is server-side rendered for an authenticated user
- **THEN** the iframe `src` MUST contain a `token` query parameter with a non-empty JWT string

### Requirement: Content-Security-Policy allows framing from n8n origin
The Next.js app's HTTP `Content-Security-Policy` header SHALL include `frame-src <N8N_BASE_URL>` (or `frame-ancestors` in the n8n response headers, as appropriate) so the iframe renders without browser security blocks.

#### Scenario: iframe renders without CSP error
- **WHEN** the `/orchestration` page is loaded in a browser
- **THEN** the browser developer console MUST show no CSP-related frame blocking errors

### Requirement: User can modify a workflow parameter and execute from the canvas
From the `/orchestration` page, a user SHALL be able to change at least one node parameter (e.g. `sentiment_threshold` in the Guardrail Check node), save the workflow, and trigger a manual execution — all without leaving the JakartAgents dashboard.

#### Scenario: Parameter change is persisted in n8n
- **WHEN** a user edits `sentiment_threshold` from 0.6 to 0.7 in the n8n editor and saves
- **THEN** the updated value MUST be reflected in the next workflow execution's `decision_input` timeline event

#### Scenario: Manual execution from canvas produces timeline events
- **WHEN** a user clicks "Execute Workflow" in the n8n editor
- **THEN** new timeline events MUST appear in the JakartAgents dashboard for that user's agent run

### Requirement: Multi-tenant isolation — users see only their own workflow
Each user's embedded n8n canvas MUST show only their own workflow. A second user opening `/orchestration` MUST NOT see the first user's workflow nodes or execution history.

#### Scenario: User A's canvas does not show User B's workflow
- **WHEN** User A and User B are both logged in and each opens `/orchestration`
- **THEN** each user's iframe MUST reference a different n8n workflow ID, scoped to their own `walletAddress`
