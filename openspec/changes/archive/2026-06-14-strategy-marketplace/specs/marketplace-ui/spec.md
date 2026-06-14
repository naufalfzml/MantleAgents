## ADDED Requirements

### Requirement: /marketplace listing page shows grid of verified strategy cards
The `/marketplace` page SHALL render a grid of cards for all `status: listed` strategies. Each card MUST display: strategy title, owner wallet (truncated), aggregate ROI percentage, run count, track record date range, rental price, and an "On-chain Verified" badge. The badge MUST only appear when `attestation_count >= MIN_ATTESTATIONS_REQUIRED` and the period requirement is met (i.e. the strategy passed eligibility at publish time).

#### Scenario: Listing page renders strategy cards
- **WHEN** an authenticated user navigates to `/marketplace`
- **THEN** they MUST see at least one card per listed strategy with title, ROI, run count, and date range visible

#### Scenario: On-chain Verified badge present on eligible strategies
- **WHEN** a strategy card is rendered for a strategy that passed eligibility
- **THEN** an "On-chain Verified" badge MUST be visible on the card

### Requirement: Strategy detail page links to every individual attestation
The strategy detail page (`/marketplace/:id`) SHALL list every `agent_attestations` row associated with the strategy owner's runs that contributed to the snapshot, each with a clickable link to the Mantle explorer transaction (`commit_tx_hash` via `mantleExplorerTxUrl()`). Attestations without a `commit_tx_hash` MUST be listed but shown as "not yet on-chain".

#### Scenario: Detail page lists individual attestation links
- **WHEN** a user opens the strategy detail page for a strategy with 10 attested runs
- **THEN** the page MUST list 10 entries, each with a link to the Mantle explorer for its `commit_tx_hash`

#### Scenario: Attestation without commit_tx_hash shown as pending
- **WHEN** an attestation row has `commit_tx_hash: null`
- **THEN** the entry MUST be displayed with a "not yet on-chain" label instead of an explorer link

### Requirement: "Past performance ≠ future results" disclaimer mandatory on every strategy page
Both the listing card and the strategy detail page SHALL display the disclaimer text "Past performance is not indicative of future results." This text MUST be visible without scrolling on the detail page (above the fold or immediately adjacent to the performance metrics).

#### Scenario: Disclaimer visible on detail page
- **WHEN** a user opens any strategy detail page
- **THEN** the text "Past performance is not indicative of future results" MUST be present in the rendered HTML

### Requirement: Rent button initiates workflow clone and shows confirmation
On the strategy detail page, an authenticated user (who is not the strategy owner) SHALL see a "Rent Strategy" button. Clicking it MUST call `POST /marketplace/strategies/:id/rent`, show a loading state, and on success display a confirmation message with a link to open the cloned workflow in the user's `/orchestration` canvas.

#### Scenario: Successful rent shows confirmation with canvas link
- **WHEN** a user clicks "Rent Strategy" and the API returns success
- **THEN** a confirmation message MUST appear with a link to `/orchestration` pointing at the cloned workflow

#### Scenario: Owner does not see Rent button on their own strategy
- **WHEN** the logged-in user's wallet matches the strategy's `owner_wallet`
- **THEN** the "Rent Strategy" button MUST NOT be rendered

### Requirement: Publish flow accessible from the agent dashboard
Authenticated users SHALL be able to navigate to a "Publish Strategy" form from their agent dashboard or the `/marketplace` page. The form MUST show the user's current attestation count and eligibility status before they attempt to publish.

#### Scenario: Publish form shows pre-computed eligibility status
- **WHEN** a user opens the "Publish Strategy" form
- **THEN** the form MUST fetch and display the user's current `attestationCount` and whether they meet the eligibility requirements
