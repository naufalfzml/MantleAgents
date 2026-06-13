## 1. Audit — enumerate all occurrences

- [x] 1.1 Run `grep -rni "byreal" --include="*.md" --include="*.ts" --include="*.tsx" .` from repo root and record every file/line
- [x] 1.2 Run `grep -rni "honeypot" --include="*.md" --include="*.ts" --include="*.tsx" .` from repo root and record every file/line
- [x] 1.3 Run `grep -rni "ai.*detect\|detect.*risk" --include="*.md" --include="*.ts" --include="*.tsx" .` to catch other AI-risk attribution variants

## 2. README fixes

- [x] 2.1 Replace all legacy wording that frames Byreal as the Mantle swap venue with "RealClaw / Byreal Skills CLI (Mantle agent layer); swap venues: Merchant Moe / Agni Finance / Fluxion"
- [x] 2.2 Add `### Custody Model` subsection under Mantle Integration: state non-custodial via Privy through RealClaw, platform never holds private keys
- [x] 2.3 Update any positioning copy that claims "fastest ROI" → "no-code agent builder for Mantle; trust derived from on-chain track record"

## 3. CLAUDE.md / AGENTS.md fixes

- [x] 3.1 Update any Byreal framing in `CLAUDE.md` to match canonical RealClaw / Byreal Skills CLI wording
- [x] 3.2 Update any Byreal framing in `AGENTS.md` (if file exists) to match same wording

## 4. API service comment fixes

- [x] 4.1 In `apps/api/src/services/realclaw-executor.ts`, update file-level docstring/comment to accurately describe RealClaw as Mantle agent layer (not DEX)
- [x] 4.2 In `apps/api/src/services/token-monitor.ts`, update any comment that attributes contract-risk checking to AI → "Contract risk check via transaction simulation / GoPlus"

## 5. Web UI label fixes

- [x] 5.1 Find all JSX/TSX components that render honeypot or risk-check labels (search `apps/web` for "honeypot", AI-attribution wording, or risk-check strings)
- [x] 5.2 Replace label strings with "Contract Risk Check (transaction simulation / GoPlus)"
- [x] 5.3 Find any UI element that uses the legacy Byreal-as-venue wording and update to "RealClaw (Mantle)"

## 6. Verification

- [x] 6.1 Re-run grep audit from step 1 — confirm zero matches for legacy Byreal-as-venue wording and AI-attributed contract-risk copy
- [x] 6.2 Run `pnpm type-check` — must exit 0
- [x] 6.3 Run `pnpm --filter @mantleagents/web build` — must exit 0
- [ ] 6.4 Run `pnpm dev`, open dashboard, visually confirm new risk-check label renders without overflow or truncation
