## Why

Three factually incorrect or misleading claims in docs and UI copy risk undermining credibility with hackathon judges: Byreal is framed as the Mantle swap venue (it is not), auto-execution is offered without any custody explanation (a security red flag), and contract-risk checking is attributed to AI when it is actually transaction simulation, not an LLM task. All three can be fixed purely in documentation and UI strings — no logic changes required.

## What Changes

- Replace every legacy reference that frames Byreal as the Mantle swap venue with accurate wording: RealClaw / Byreal Skills CLI (Mantle agent layer); on-chain swap venues are Merchant Moe / Agni Finance / Fluxion.
- Add an explicit **Custody Model** subsection to README explaining non-custodial execution via Privy through RealClaw.
- Rename / relabel all UI and doc references that attribute contract-risk checking to AI → "Contract Risk Check (transaction simulation / GoPlus)"; restrict AI attribution to sentiment/narrative analysis only.
- Tighten pitch positioning away from "fastest ROI" toward "no-code agent builder for Mantle whose trust comes from on-chain track record."

## Capabilities

### New Capabilities

- `custody-model-docs`: Documents the non-custodial execution model (Privy via RealClaw) so users and judges understand how private keys are handled.

### Modified Capabilities

*(none — no spec-level behavior changes; all changes are documentation and UI string copy)*

## Impact

- `README.md` — new Custody Model section; Byreal framing corrected
- `CLAUDE.md` — Byreal/RealClaw wording updated if present
- `apps/web` components displaying risk-check labels or Mantle integration status
- `apps/api/src/services/realclaw-executor.ts` and `token-monitor.ts` — comment/docstring copy only
- No TypeScript logic changes; `pnpm type-check` and `pnpm build` must stay green
