# 05 — Intent-Centric Workflow Generation

> Referensi untuk: `openspec propose intent-workflow-generation`
> Sumber: `Dokumentasi_Konseptual_JakartAgents_V2.md` §2.1, §4 (skenario penggunaan)
> Bergantung pada: Tahap 4 (kanvas n8n + node wrappers harus ada lebih dulu)

## 1. Kenapa tahap ini ada

Pilar V2 #1 — UX unlock utama menurut review ("fitur terkuat... jangan dikecilin"):
user menulis prompt bahasa natural, AI men-generate workflow n8n yang siap jalan.

Contoh dari dokumen konsep:
> "Pantau likuiditas token XYZ. Jika volume beli tinggi dan contract risk check
> menyatakan token aman, langsung masuk posisi $500. Pasang auto-sell saat profit 20% dan
> ketat di stop-loss 5%."

Catatan penting (carry-over dari Tahap 0): user bisa saja memakai bahasa natural
yang keliru tentang contract-risk checking, tapi **workflow yang dihasilkan**
harus memetakan "no honeypot risk" ke node **"Risk Check" (tx simulation/GoPlus)**,
bukan node AI — penting untuk konsistensi dengan Tahap 0.

## 2. Scope

**In scope:**
- Endpoint baru `apps/api/src/routes/workflow-generator.ts`:
  - Input: `{ prompt: string, walletAddress: string }`.
  - Proses: kirim prompt + **daftar node yang tersedia** (dari Tahap 4, sebagai
    "tools"/schema) ke Gemini, minta output **n8n workflow JSON** terstruktur
    (gunakan pola structured output / JSON mode, reuse pendekatan
    `llm-analyzer.ts`/`model-router.ts`).
  - Output: `{ workflowJson, summary, validation: {passed: boolean, issues: string[]} }`.
- **Validasi guardrail wajib** sebelum workflow bisa di-deploy:
  - Workflow hasil generate **harus** mengandung node "Guardrail Check" dan (jika
    melibatkan trade) node "Risk Check" — reject/auto-fix jika tidak ada.
  - Parameter guardrail (max trade size, stop-loss, dsb) di workflow tidak boleh
    melebihi limit akun user (cek terhadap `agent_configs` / user settings).
- UI: komponen chat di `/orchestration` (extend Tahap 4) — input prompt, tampilkan
  preview workflow (diagram + ringkasan teks) sebelum user klik "Deploy to Canvas".
- Logging: setiap generate tersimpan (prompt, output, hasil validasi) untuk audit —
  tabel baru `generated_workflows` di Supabase.

**Out of scope:**
- Auto-deploy tanpa konfirmasi user (selalu butuh klik "Deploy").
- Generative editing dari workflow existing (baru generate dari nol) — bisa jadi
  iterasi lanjutan, dicatat sebagai catatan di proposal tapi tidak wajib untuk MVP.

## 3. Perubahan konkret

| Komponen | Perubahan |
|---|---|
| `apps/api/src/services/workflow-generator.ts` (baru) | Prompt construction, panggil LLM dengan schema node dari Tahap 4, parse+validate JSON output |
| `apps/api/src/services/workflow-validator.ts` (baru) | Validasi struktural (node wajib ada) + validasi guardrail-vs-user-limit |
| `apps/api/src/routes/workflow-generator.ts` (baru) | Endpoint `POST /workflow/generate` |
| `supabase/migrations/` | Tabel `generated_workflows` (prompt, output_json, validation_result, wallet_address, created_at) |
| `apps/web/src/.../orchestration` | Komponen chat + preview + tombol "Deploy to Canvas" (memakai n8n API dari Tahap 4 untuk import workflow) |

## 4. Acceptance Criteria

- [ ] Prompt valid (mis. contoh dari dokumen konsep di atas) menghasilkan workflow
      JSON yang **lulus validasi** (mengandung Guardrail Check + Risk Check untuk
      skenario trading).
- [ ] Prompt yang meminta sesuatu di luar guardrail user (mis. "masuk posisi
      $50,000" padahal limit user $500) → `validation.passed = false` dengan
      `issues` yang menjelaskan, workflow **tidak** bisa di-deploy sampai user
      menyesuaikan prompt/parameter.
- [ ] Prompt yang ambigu/tidak jelas (mis. "buatkan strategi yang untung terus") →
      sistem tidak menghasilkan workflow palsu yang "pasti profit"; minimal
      menghasilkan workflow dengan guardrail wajar + catatan bahwa "profit
      konsisten" tidak bisa dijamin (hindari overclaim, relevan untuk poin "Strategy
      design & risk management" / BGA ethos).
- [ ] Setiap generate (sukses maupun gagal validasi) tercatat di `generated_workflows`.

## 5. Testing

### Unit tests (`workflow-validator.test.ts` — baru)
- Workflow JSON dengan node Guardrail Check + Risk Check lengkap → `passed: true`.
- Workflow JSON tanpa Risk Check tapi ada node trade → `passed: false`, issue
  menyebut "missing risk check".
- Workflow JSON dengan `maxValuePerTx` melebihi limit user (mock user config) →
  `passed: false`, issue menyebut limit yang dilanggar.
- Workflow JSON malformed (field hilang/tipe salah) → `passed: false`, tidak crash
  (graceful parse error).

```bash
cd apps/api && pnpm vitest run src/services/workflow-validator.test.ts
```

### Unit tests (`workflow-generator.test.ts` — baru, mock LLM)
Pola mengikuti `llm-analyzer.test.ts` (mock Gemini response):
- Mock LLM mengembalikan JSON workflow valid → endpoint mengembalikan
  `workflowJson` + `validation.passed = true`.
- Mock LLM mengembalikan JSON tidak valid (broken JSON / field hilang) → endpoint
  tidak crash, mengembalikan error terstruktur (`validation.passed = false`,
  issue "invalid JSON from model") — bukan 500.
- Mock LLM mengembalikan workflow yang melanggar guardrail user → endpoint
  mengembalikan `validation.passed = false` dengan issue yang sama seperti unit
  test validator di atas (test integrasi generator+validator).

```bash
cd apps/api && pnpm vitest run src/services/workflow-generator.test.ts
```

### Manual / demo verification
1. Di `/orchestration`, ketik prompt persis dari contoh dokumen konsep (token XYZ,
   $500, TP 20%, SL 5%).
2. Pastikan preview menampilkan node: Get Market Data → AI Signal Analysis → Risk
   Check → Guardrail Check → Execute Trade → Commit Attestation, dengan parameter
   sesuai prompt (amount $500, TP 20%, SL 5%).
3. Klik "Deploy to Canvas" → verifikasi workflow muncul di kanvas n8n (Tahap 4) milik
   user tersebut.
4. Coba prompt dengan amount melebihi limit akun → pastikan UI menampilkan pesan
   validasi dan tombol "Deploy" disabled/tidak muncul.

## 6. Definition of Done

User mengetik satu prompt strategi dalam bahasa natural, sistem menghasilkan
workflow n8n yang valid (lulus validasi guardrail + risk check), dan user bisa
langsung men-deploy & menjalankannya dari kanvas (Tahap 4).
