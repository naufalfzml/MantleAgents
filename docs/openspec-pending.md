# OpenSpec — Pending Tasks Summary

_Generated 2026-06-12. Covers changes that have been partially implemented
but contain tasks that have not yet been completed._

---

## 1. n8n-orchestration-canvas

### What was completed

Sections 1–4 and task 6.1 are fully implemented:
infrastructure (docker-compose, env vars), shared bridge payload types,
all 6 n8n bridge API endpoints with HMAC auth, a full test suite,
and the `n8n_workflow_id` DB column migration.

### What is still pending

#### 1.5 — Smoke-test docker compose
> Verify `docker compose up` starts both api and n8n; n8n UI accessible at `http://localhost:5678`.

**Why not done:** Requires a running Docker daemon in the local dev environment. This is a manual verification step that cannot be automated in the codebase and was not executed during the implementation session.

---

#### 2.8 — Type-check passes
> Run `pnpm type-check` — exit 0.

**Why not done:** Depends on n8n bridge types being consumed end-to-end (including the provisioner and UI page from sections 6–7 which are not yet built). Running type-check now would likely surface unresolved references in those stubs. Should be verified once sections 6 and 7 are complete.

---

#### 5.x — n8n workflow template
> Create `n8n/templates/fx-agent-default-flow.json` with 6 HTTP Request nodes in sequence and verify it imports cleanly into a live n8n instance.

**Why not done:** Building a valid n8n workflow JSON export requires either a running n8n instance to export from, or manual construction of the internal n8n node schema. Neither was feasible without a live environment. The API endpoints it calls are complete, so the template can be built once Docker is running.

---

#### 6.2–6.4 — First-visit workflow provisioner
> `apps/api/src/services/n8n-provisioner.ts` — POST workflow template to n8n REST API on first login, store workflow ID, expose `GET /api/n8n/provision`, verify idempotency.

**Why not done:** Requires the n8n REST API to be live (`N8N_BASE_URL` + `N8N_API_KEY`) and the template from task 5.x to exist. These are runtime dependencies that cannot be wired up without a running n8n instance. The DB column (`n8n_workflow_id`) is ready; this is purely the service layer on top.

---

#### 7.x — /orchestration UI page
> Server component that calls `/api/n8n/provision`, generates a short-lived JWT, and renders an `<iframe>` embedding the n8n canvas with CSP `frame-src` header wired.

**Why not done:** Blocked on the provisioner (task 6.2–6.4) existing first. Additionally, the iframe JWT generation requires `N8N_BASE_URL` to be set and reachable; the feature would silently break without the provisioner running.

---

#### 8.x — Full end-to-end manual verification
> All docker compose + UI flows, multi-user workflow isolation check.

**Why not done:** All 8.x items are manual QA steps gated on sections 5–7 being complete. Cannot be automated.

---

#### 9.x — Final cleanup
> `pnpm type-check` exit 0, `pnpm --filter @mantleagents/web build` exit 0, README env vars table update.

**Why not done:** Gated on the remaining sections above being complete. Type-check and build are expected to be clean for the already-implemented sections, but the full check should be run only once sections 5–7 are wired up.

---

## 2. ux-onboarding-aa

### What was completed

Sections 1–8 and 10 are fully implemented:
API balance + system status endpoints and tests, explorer URL hook,
tx hash links in timeline/attestation UI, StatusBadge + dashboard
integration, web Vitest setup + StatusBadge tests, StepIndicator +
FundWalletGuide components, onboarding page integration, README update,
and type-check + build verified.

### What is still pending

#### 9.x — Manual demo verification
> Six manual QA steps: fresh wallet faucet flow, recheck balance without reload, agent registration persistence, badges visible in header, tx hash links opening correct explorer, and README walkthrough as a new user.

**Why not done:** All 9.x items are manual browser/wallet verification steps that require a running stack (`pnpm dev`) connected to Mantle Sepolia testnet, a real wallet with 0 MNT, and access to the faucet. These cannot be automated or asserted in code — they are acceptance criteria for a human tester.

**What to do:** Run `pnpm dev`, connect a fresh MetaMask wallet with 0 MNT testnet balance, and walk through each step in order. Expected time: ~15 minutes.

---

## Summary Table

| Change | Section | Pending Tasks | Blocker |
|--------|---------|---------------|---------|
| n8n-orchestration-canvas | 1 | 1.5 | Manual Docker verification |
| n8n-orchestration-canvas | 2 | 2.8 | Needs sections 6–7 complete first |
| n8n-orchestration-canvas | 5 | 5.1–5.5 | Needs live n8n instance |
| n8n-orchestration-canvas | 6 | 6.2–6.4 | Needs live n8n + template |
| n8n-orchestration-canvas | 7 | 7.1–7.6 | Needs provisioner (6.2–6.4) |
| n8n-orchestration-canvas | 8 | 8.1–8.6 | Needs sections 5–7 |
| n8n-orchestration-canvas | 9 | 9.1–9.3 | Needs sections 5–7 |
| ux-onboarding-aa | 9 | 9.1–9.6 | Manual QA (live stack + real wallet) |
