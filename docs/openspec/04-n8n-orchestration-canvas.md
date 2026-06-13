# 04 — Unified n8n Orchestration Canvas

> Referensi untuk: `openspec propose n8n-orchestration-canvas`
> Sumber: `Dokumentasi_Konseptual_MantleAgents_V2.md` §2.3, §3 (baris arsitektur
> "Mesin Orkestrasi (n8n Core)")

## 1. Kenapa tahap ini ada

Pilar V2 #3: satukan FX Agent, Yield Agent, dan Risk/Honeypot Checker — yang saat
ini terfragmentasi sebagai service terpisah (`fx` cron path, `yield` cron path,
`token-monitor.ts`) — menjadi **satu kanvas n8n** yang bisa di-drag-and-drop user.

Tahap ini adalah **fondasi infrastruktur** untuk Tahap 5 (intent-to-workflow) dan
Tahap 6 (marketplace). Tanpa kanvas yang berfungsi, dua tahap berikutnya tidak punya
tempat untuk "menjalankan" workflow yang dihasilkan/dijual.

## 2. Scope

**In scope:**
- **Provisioning n8n**: tambahkan service n8n (self-hosted, docker) ke
  `docker-compose`/dev setup, atau dokumentasikan koneksi ke n8n cloud instance.
- **Custom nodes / HTTP wrapper nodes** untuk fungsi existing:
  - `market-data-service.ts` → node "Get Market Data" (input: token, output: price/kline/risk)
  - `llm-analyzer.ts` → node "AI Signal Analysis" (input: market data, output: signal+confidence+reasoning)
  - `rules-engine.ts` → node "Guardrail Check" (input: signal+config, output: pass/fail+adjusted plan)
  - `trade-executor.ts` (via RealClaw, Tahap 1) → node "Execute Trade (Mantle)"
  - `attestation-service.ts` (Tahap 2) → node "Commit Attestation"
  - Risk-check (GoPlus/simulation, dari Tahap 0 reframe) → node "Risk Check"
- **Auth bridge**: n8n workflow per user perlu tahu `walletAddress`/agent config milik
  user — jembatani via API key/JWT yang di-passing dari sesi SIWE existing
  (`apps/api/src/middleware`).
- **Template workflow default**: 1 workflow JSON "FX Agent Default Flow" yang
  merangkai node-node di atas, setara dengan alur `agent-cron.ts` saat ini.
- **UI embed**: di `apps/web`, halaman/iframe baru "Orchestration Canvas" yang
  embed n8n editor (atau link out dengan SSO) untuk workflow milik user.

**Out of scope:**
- AI generation workflow dari prompt (Tahap 5).
- Marketplace (Tahap 6).
- Mengganti `agent-cron.ts` sepenuhnya — untuk hackathon, n8n bisa **berjalan
  paralel** sebagai opsi "advanced/custom" sementara cron default tetap jadi
  fallback (mengurangi risiko regresi pada fitur yang sudah dinilai di Tahap 1-3).

## 3. Perubahan konkret

| Komponen | Perubahan |
|---|---|
| `docker-compose.yml` (baru, jika belum ada) atau dev docs | Tambah service `n8n` + volume persist workflow |
| `apps/api/src/routes/` | Endpoint baru `n8n-bridge.ts`: expose fungsi internal sebagai REST endpoint yang dipanggil n8n HTTP node, dengan auth via API key per user |
| `packages/shared` | Tipe untuk payload request/response tiap "node" (kontrak API n8n↔backend) |
| `apps/web/src/...` | Halaman baru `/orchestration` — embed n8n editor via iframe + token SSO |
| `n8n/templates/` (baru) | File JSON template workflow "FX Agent Default Flow" |

## 4. Acceptance Criteria

- [ ] n8n instance bisa dijalankan via `pnpm dev` (atau dokumentasi setup terpisah
      jika pakai cloud) dan dapat memanggil endpoint `n8n-bridge` dengan autentikasi
      yang valid.
- [ ] Setiap node wrapper (market data, AI signal, guardrail, execute, attest, risk
      check) bisa dipanggil individual dari n8n dan mengembalikan response yang
      sesuai kontrak tipe di `packages/shared`.
- [ ] Template "FX Agent Default Flow" saat dijalankan end-to-end di n8n
      menghasilkan output yang **setara** dengan satu siklus `agent-cron.ts` (sama
      jenis event timeline yang tercatat).
- [ ] User login bisa membuka `/orchestration`, melihat workflow miliknya sebagai
      node-node visual, dan mengubah minimal satu parameter (mis. threshold sentiment)
      lalu menjalankan workflow tersebut.

## 5. Testing

### Unit tests — n8n bridge endpoints (`apps/api/src/routes/n8n-bridge.test.ts` — baru)
Pola mengikuti `agent.test.ts` (Fastify route test existing):
- Tiap endpoint node wrapper: test request valid → response sesuai schema
  `packages/shared`.
- Test auth: request tanpa/keliru API key → 401, tidak menjalankan logic internal.
- Test passthrough: endpoint "Execute Trade" dengan mock `trade-executor` → pastikan
  parameter diteruskan tanpa modifikasi tak terduga (mis. tidak ada double-guardrail
  atau guardrail terlewat).

```bash
cd apps/api && pnpm vitest run src/routes/n8n-bridge.test.ts
```

### Integration test — template workflow
- Skrip test (boleh manual/bash) yang men-trigger workflow "FX Agent Default Flow"
  via n8n REST API (`/workflows/:id/execute` atau webhook trigger), dengan backend
  API berjalan di mode test (mock external calls: LLM, RealClaw, dsb. — reuse mock
  dari `agent-cron.test.ts` jika strukturnya cocok).
- Assert: timeline event yang dihasilkan via n8n run **sama bentuknya** (event types,
  urutan) dengan yang dihasilkan `agent-cron.ts` untuk input setara — bandingkan
  dengan snapshot dari test Tahap 1-3.

### Manual / demo verification
1. `pnpm dev` (termasuk n8n service).
2. Login dashboard, buka `/orchestration`.
3. Pastikan kanvas n8n termuat dengan workflow default user.
4. Ubah satu parameter node (mis. `sentiment_threshold` di node "Guardrail Check")
   dari 0.6 → 0.7, save.
5. Jalankan workflow manual dari n8n UI → cek di dashboard timeline bahwa run baru
   muncul dan menggunakan threshold baru (cek di event `decision_input` dari Tahap 2).
6. Cek isolasi: user lain login → workflow yang terlihat adalah miliknya sendiri,
   bukan workflow user pertama (test multi-tenant dasar).

## 6. Definition of Done

User login bisa membuka kanvas n8n dari dashboard, melihat workflow agent default
mereka sebagai node-node visual, memodifikasi minimal satu parameter, dan
menjalankannya — menghasilkan timeline event yang setara dengan jalur cron biasa.
