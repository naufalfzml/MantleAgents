## ADDED Requirements

### Requirement: Onboarding page shows a 5-step progress indicator
The `(auth)/onboarding` page SHALL display a step indicator with exactly five steps in order: (1) Connect Wallet, (2) Fund Wallet, (3) Register Agent, (4) Configure Guardrails, (5) Start Agent. Each step MUST show a visual state: completed (green checkmark), active/current (highlighted), or pending (muted).

#### Scenario: New wallet sees Fund step as active
- **WHEN** a user with a connected wallet but zero MNT balance views the onboarding page
- **THEN** step 1 (Connect Wallet) MUST appear completed, step 2 (Fund Wallet) MUST appear as the active/current step, and steps 3–5 MUST appear pending

#### Scenario: Registered agent with guardrails sees Start Agent as active
- **WHEN** a user has completed steps 1–4 but has `is_active: false` on their agent config
- **THEN** steps 1–4 MUST appear completed and step 5 (Start Agent) MUST appear as the active step

### Requirement: Fund Wallet step shows faucet link and Recheck balance button
When step 2 (Fund Wallet) is the active step, the onboarding page SHALL display the testnet faucet URL (`https://faucet.sepolia.mantle.xyz`) as a clickable link opening in a new tab, and a "Recheck balance" button that re-fetches `GET /api/user/balance` without a full page reload.

#### Scenario: Faucet link visible when Fund step is active
- **WHEN** step 2 is the active step
- **THEN** a link to the Mantle Sepolia faucet MUST be visible and MUST open in a new browser tab

#### Scenario: Recheck balance updates step state without reload
- **WHEN** a user clicks "Recheck balance" after funding their wallet
- **THEN** the step indicator MUST update to show step 2 as completed (if balance > 0) without a full page reload

### Requirement: GET /api/user/balance returns balance and hasFunds
The `GET /api/user/balance` endpoint SHALL be authenticated (SIWE JWT), call `publicClient.getBalance({ address: walletAddress })` on the configured Mantle network, and return `{ balance: string, hasFunds: boolean, faucetUrl: string | null }`. `hasFunds` MUST be true iff balance is greater than zero. `faucetUrl` MUST be the testnet faucet URL on `testnet` and `null` on `mainnet`.

#### Scenario: Zero balance returns hasFunds false with faucet URL
- **WHEN** `GET /api/user/balance` is called for a wallet with 0 MNT
- **THEN** `hasFunds` MUST be `false` and `faucetUrl` MUST be non-null (on testnet)

#### Scenario: Funded wallet returns hasFunds true
- **WHEN** `GET /api/user/balance` is called for a wallet with balance > 0
- **THEN** `hasFunds` MUST be `true`

#### Scenario: Unauthenticated request returns 401
- **WHEN** `GET /api/user/balance` is called without a valid JWT
- **THEN** the response MUST be HTTP 401

### Requirement: Step state derived from real API data, not hardcoded
The step indicator SHALL derive each step's completion state from live API responses: step 2 from `GET /api/user/balance`, steps 3–5 from `GET /api/agent/config` (or the equivalent agent status endpoint). State MUST NOT be stored only in client-side local state that does not survive page refresh.

#### Scenario: Page refresh preserves correct step state
- **WHEN** a user who has completed steps 1–3 refreshes the onboarding page
- **THEN** the step indicator MUST show steps 1–3 as completed after the API calls resolve, without requiring any user interaction
