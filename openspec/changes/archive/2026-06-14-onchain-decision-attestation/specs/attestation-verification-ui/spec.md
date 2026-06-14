## ADDED Requirements

### Requirement: Run Detail page displays decision trail
The Run Detail page in `apps/web` SHALL display an ordered decision trail for each agent run: signal summary → guardrail evaluation result → execution outcome → on-chain attestation hashes.

#### Scenario: Decision trail visible on run detail page
- **WHEN** a user navigates to the Run Detail page for a completed run
- **THEN** the page MUST display at minimum: the LLM signal action and confidence, the guardrail pass/fail result, the trade outcome (or skipped reason), and the `decisionHash` and `eventsHash` values

### Requirement: Verified on-chain badge links to Mantle explorer tx
When `commitTxHash` is present for a run's attestation, the Run Detail page SHALL display a "Verified on-chain" badge. The badge MUST be a link that opens the Mantle Sepolia (or mainnet) explorer URL for the `commitTxHash`.

#### Scenario: Badge displayed when commitTxHash is present
- **WHEN** the attestation for the displayed run has a non-null `commitTxHash`
- **THEN** a "Verified on-chain" badge MUST be visible and MUST link to the correct explorer URL

#### Scenario: No badge when commitTxHash is absent
- **WHEN** the attestation for the displayed run has a null `commitTxHash`
- **THEN** the "Verified on-chain" badge MUST NOT be displayed; a neutral status indicator MAY be shown instead (e.g. "Attestation pending")

### Requirement: On-chain hash values are copyable from the UI
Both `decisionHash` and `eventsHash` displayed on the Run Detail page SHALL be copyable (click-to-copy or displayed in a monospace truncated field with full value accessible) so a judge can independently verify them against the on-chain data.

#### Scenario: decisionHash copyable
- **WHEN** a user clicks the copy icon or action next to the displayed `decisionHash`
- **THEN** the full 64-character hex string MUST be copied to the clipboard
