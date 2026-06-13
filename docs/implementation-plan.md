# Implementation Plan — MantleAgents Pending OpenSpec Tasks

_Last updated: 2026-06-12._

---

## Urutan Eksekusi `/openspec-apply-change`

Jalankan satu per satu dari atas ke bawah. Nomor 3, 4, 5 harus tunggu yang sebelumnya selesai.

```
1. /openspec-apply-change onchain-decision-attestation
2. /openspec-apply-change n8n-orchestration-canvas
3. /openspec-apply-change realclaw-execution-live        ← setelah n8n selesai
4. /openspec-apply-change intent-workflow-generation     ← tunggu no. 2 selesai
5. /openspec-apply-change strategy-marketplace           ← tunggu no. 4 selesai
```

> `hygiene-positioning-fix`, `agent-autonomy-showcase`, `ux-onboarding-aa` tidak perlu di-apply — kode sudah selesai, hanya tersisa manual QA.

---

## Setelah Semua Apply Selesai

### Verifikasi kode
```bash
pnpm type-check
pnpm --filter @mantleagents/web build
pnpm test
```

### Manual QA (butuh `pnpm dev` + wallet Mantle Sepolia)

| # | OpenSpec | Yang diverifikasi | Waktu |
|---|----------|-------------------|-------|
| 1 | hygiene-positioning-fix | Visual confirm risk-check label di dashboard | 5 menit |
| 2 | agent-autonomy-showcase | Trigger run → cek `decision_adapted` event di timeline | 15 menit |
| 3 | ux-onboarding-aa | Fresh wallet → faucet → recheck balance → badge → tx links | 15 menit |
| 4 | n8n-orchestration-canvas | Docker up → `/orchestration` → canvas load → multi-user isolation | 30 menit |
| 5 | realclaw-execution-live | Live swap test di Mantle Sepolia | 20 menit |
