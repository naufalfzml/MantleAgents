## Context

JakartAgents is a hackathon submission for The Turing Test 2026 (Mantle). The codebase and docs evolved quickly and now contain three categories of misleading copy that could cause judges to distrust the technical accuracy of the project:

1. **Byreal-as-DEX confusion** — Byreal is a Solana DEX; JakartAgents uses the Byreal agent layer (RealClaw / OpenClaw / Byreal Skills CLI) that operates on Mantle at `openclaw.mantle.xyz`. The actual on-chain swap venues are Merchant Moe, Agni Finance, and Fluxion.
2. **Missing custody model** — agents that auto-execute trades require an explicit statement about who holds private keys. The answer (Privy via RealClaw, non-custodial) is already implemented but never documented.
3. **"AI honeypot detection"** — honeypot detection is a deterministic transaction simulation (GoPlus / `eth_call`); attributing it to the LLM is technically wrong and undermines credibility for technically literate judges.

This change is **copy-only**: it touches docs, comments, and UI string literals — no runtime logic.

## Goals / Non-Goals

**Goals:**
- Eliminate all factually incorrect references to Byreal as a Mantle DEX.
- Document the custody model explicitly in README.
- Relabel all honeypot/risk UI copy to accurately describe transaction simulation.
- Tighten positioning copy to emphasise on-chain track record over performance claims.
- Keep `pnpm type-check` and `pnpm build` green throughout.

**Non-Goals:**
- Changing the actual honeypot detection logic or GoPlus integration.
- Changing RealClaw executor logic or Privy integration code.
- Adding or removing features.
- Writing new unit tests (no logic changes warranting them).

## Decisions

**D1 — Grep-first, then edit**
Before editing any file, run the canonical grep audit from the reference doc to enumerate every occurrence. This prevents missing occurrences and serves as the acceptance-test baseline.

Rationale: copy errors are easy to miss if editing files individually; a complete occurrence list lets us verify nothing is skipped.

**D2 — Minimal diff in `.ts`/`.tsx` files**
Changes to TypeScript files are restricted to string literals in JSX, comment lines, and single-line docstrings. No function signatures, types, or logic are touched. This preserves a clean type-check and removes any risk of accidental regressions.

Rationale: the acceptance criteria explicitly require no `.ts`/`.tsx` logic changes; a minimal diff makes review trivial.

**D3 — Single Custody Model section in README**
Add a dedicated `### Custody Model` subsection under the existing Mantle Integration section (or create that section if absent). Reference Privy and RealClaw by name with a one-line description of the non-custodial flow.

Rationale: judges look at README first; a named, findable section is more credible than prose scattered across paragraphs.

**D4 — Standardise honeypot label across UI and docs**
Canonical replacement string: `Contract Risk Check (transaction simulation / GoPlus)`. Use this exact string in all UI labels, tooltips, and doc prose so there is a single searchable token for future audits.

## Risks / Trade-offs

- **UI label truncation** → verify in running dev server that the longer string fits in the badge/chip component without overflow; adjust CSS only if needed.
- **Grep misses binary/generated files** → scope grep to `--include="*.md" --include="*.ts" --include="*.tsx" --include="*.json"` to avoid false positives while catching all relevant files.
- **README section placement** → placing Custody Model prominently may shift the document's reading flow; keep it immediately after the technical execution description so it reads as a continuation, not an aside.
