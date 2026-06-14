## ADDED Requirements

### Requirement: useExplorerTxUrl hook returns the correct Mantle explorer URL
The `useExplorerTxUrl(txHash: string | null)` hook in `apps/web/src/lib/explorer.ts` SHALL return the full explorer URL for a given tx hash using the same network determination as the backend (`NEXT_PUBLIC_MANTLE_NETWORK` env var or system status). For `null` input it MUST return `null`. For a valid hash it MUST return a non-empty string URL pointing to the configured Mantle network explorer.

#### Scenario: Valid tx hash returns full explorer URL
- **WHEN** `useExplorerTxUrl('0xabc...')` is called on testnet
- **THEN** the returned string MUST start with the Mantle Sepolia explorer base URL and end with `0xabc...`

#### Scenario: Null input returns null
- **WHEN** `useExplorerTxUrl(null)` is called
- **THEN** the returned value MUST be `null`

### Requirement: All timeline tx_hash values in the UI link to the Mantle explorer
Every component in `apps/web` that renders a `tx_hash` or `txHash` value from agent timeline events SHALL render it as a clickable anchor tag using `useExplorerTxUrl`, opening in a new browser tab. Displaying the raw hash as plain unlinked text is not acceptable after this change.

#### Scenario: Timeline event with tx_hash shows clickable explorer link
- **WHEN** a timeline event with `tx_hash` is rendered on the FX Agent or Yield Agent page
- **THEN** the tx hash MUST be rendered as an anchor tag (`<a href="..." target="_blank">`) pointing to the Mantle explorer

#### Scenario: Timeline event without tx_hash shows no broken link
- **WHEN** a timeline event with `tx_hash: null` is rendered
- **THEN** no anchor tag or placeholder link MUST be rendered for the hash field

### Requirement: Attestation commit_tx_hash links to Mantle explorer
Every component in `apps/web` that renders an attestation `commitTxHash` (from Change 02) SHALL use `useExplorerTxUrl` to render it as a clickable link. This applies to the Run Detail page (Change 02) and the marketplace detail page (Change 06).

#### Scenario: Attestation with commitTxHash shows explorer link
- **WHEN** an attestation with a non-null `commitTxHash` is rendered
- **THEN** an anchor tag pointing to the Mantle explorer MUST be present in the rendered HTML

### Requirement: Explorer links use the correct network (testnet vs mainnet)
The explorer base URL used by `useExplorerTxUrl` MUST match the `NEXT_PUBLIC_MANTLE_NETWORK` env var: `testnet` → Mantle Sepolia explorer; `mainnet` → Mantle mainnet explorer. Hardcoded testnet URLs in the frontend are not acceptable.

#### Scenario: Testnet configuration uses Sepolia explorer
- **WHEN** `NEXT_PUBLIC_MANTLE_NETWORK=testnet` and `useExplorerTxUrl` is called
- **THEN** the returned URL MUST contain the Mantle Sepolia explorer domain

#### Scenario: Mainnet configuration uses mainnet explorer
- **WHEN** `NEXT_PUBLIC_MANTLE_NETWORK=mainnet` and `useExplorerTxUrl` is called
- **THEN** the returned URL MUST contain the Mantle mainnet explorer domain
