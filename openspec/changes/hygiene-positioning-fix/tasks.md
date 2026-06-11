## 1. Audit — enumerate all occurrences

- [ ] 1.1 Run `grep -rni "byreal" --include="*.md" --include="*.ts" --include="*.tsx" .` from repo root and record every file/line
- [ ] 1.2 Run `grep -rni "honeypot" --include="*.md" --include="*.ts" --include="*.tsx" .` from repo root and record every file/line
- [ ] 1.3 Run `grep -rni "ai.*detect\|detect.*risk" --include="*.md" --include="*.ts" --include="*.tsx" .` to catch other AI-risk attribution variants

## 2. README fixes

- [ ] 2.1 Replace all "Byreal DEX / Byreal API Mantle" references with "RealClaw / Byreal Skills CLI (Mantle agent layer); swap venues: Merchant Moe / Agni Finance / Fluxion"
- [ ] 2.2 Add `### Custody Model` subsection under Mantle Integration: state non-custodial via Privy through RealClaw, platform never holds private keys
- [ ] 2.3 Update any positioning copy that claims "fastest ROI" → "no-code agent builder for Mantle; trust derived from on-chain track record"

## 3. CLAUDE.md / AGENTS.md fixes

- [ ] 3.1 Update any Byreal framing in `CLAUDE.md` to match canonical RealClaw / Byreal Skills CLI wording
- [ ] 3.2 Update any Byreal framing in `AGENTS.md` (if file exists) to match same wording

## 4. API service comment fixes

- [ ] 4.1 In `apps/api/src/services/realclaw-executor.ts`, update file-level docstring/comment to accurately describe RealClaw as Mantle agent layer (not DEX)
- [ ] 4.2 In `apps/api/src/services/token-monitor.ts`, update any comment that says "AI detects honeypot" → "Contract risk check via transaction simulation / GoPlus"

## 5. Web UI label fixes

- [ ] 5.1 Find all JSX/TSX components that render honeypot or risk-check labels (search `apps/web` for "honeypot", "AI.*risk", "AI.*detect")
- [ ] 5.2 Replace label strings with "Contract Risk Check (transaction simulation / GoPlus)"
- [ ] 5.3 Find any UI element that labels Mantle integration as "Byreal DEX" and update to "RealClaw (Mantle)"

## 6. Verification

- [ ] 6.1 Re-run grep audit from step 1 — confirm zero matches for "byreal.*dex" and "ai.*honeypot"
- [ ] 6.2 Run `pnpm type-check` — must exit 0
- [ ] 6.3 Run `pnpm --filter @jakartagents/web build` — must exit 0
- [ ] 6.4 Run `pnpm dev`, open dashboard, visually confirm new risk-check label renders without overflow or truncation
