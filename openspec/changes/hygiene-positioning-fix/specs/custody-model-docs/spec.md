## ADDED Requirements

### Requirement: README documents custody model explicitly
The README SHALL contain a dedicated subsection titled "Custody Model" that states agents execute trades non-custodially via Privy through RealClaw, and that the platform never holds or has access to users' private keys.

#### Scenario: Custody Model section present in README
- **WHEN** a reader opens `README.md`
- **THEN** they SHALL find a "Custody Model" subsection under the Mantle Integration section that names Privy and RealClaw as the non-custodial execution path

#### Scenario: No ambiguous custody claim remains
- **WHEN** `grep -ri "auto.execut\|self-execut" README.md` is run
- **THEN** every match MUST be accompanied by or preceded by a reference to the non-custodial model within the same paragraph or section

### Requirement: Byreal references use accurate framing
All documentation and UI copy SHALL refer to Byreal only as an agent layer (RealClaw / Byreal Skills CLI) operating on Mantle, and SHALL NOT frame Byreal as the Mantle swap venue.

#### Scenario: No legacy Byreal-as-venue wording in tracked files
- **WHEN** grep is run from repo root (excluding node_modules) for wording that places Byreal in the swap-venue role
- **THEN** zero matches are returned

#### Scenario: On-chain swap venues named correctly
- **WHEN** a user reads any documentation or UI section about Mantle trade execution
- **THEN** the swap venues MUST be identified as one or more of: Merchant Moe, Agni Finance, Fluxion

### Requirement: Honeypot and contract risk copy uses accurate attribution
All UI labels, tooltips, and documentation copy that describes honeypot or contract risk detection SHALL attribute the check to transaction simulation (GoPlus / `eth_call`) and SHALL NOT claim the LLM/AI performs that contract-risk check. AI attribution MUST be restricted to sentiment or narrative analysis.

#### Scenario: No AI-attributed contract-risk wording in tracked files
- **WHEN** grep is run from repo root for wording that assigns contract-risk checks to AI, including honeypot checks
- **THEN** zero matches are returned

#### Scenario: Risk label displays correct attribution
- **WHEN** a user views the token risk-check badge or tooltip in the web dashboard
- **THEN** the label SHALL read "Contract Risk Check (transaction simulation / GoPlus)" or equivalent text that names simulation/GoPlus rather than AI

### Requirement: Type-check and build remain green after copy changes
All copy-only changes to `.ts` and `.tsx` files SHALL NOT break TypeScript compilation or the Next.js production build.

#### Scenario: Type-check passes after changes
- **WHEN** `pnpm type-check` is run after all copy edits are applied
- **THEN** the command MUST exit with code 0

#### Scenario: Web build passes after changes
- **WHEN** `pnpm --filter @jakartagents/web build` is run after all copy edits are applied
- **THEN** the command MUST exit with code 0
