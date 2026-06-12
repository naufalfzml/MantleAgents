# JakartAgents — Panduan Roadmap untuk OpenSpec

> Dokumen kerja (bukan format OpenSpec). Tujuannya: jadi rujukan saat menjalankan
> `openspec propose` per fitur/tahap. Setiap bagian "Tahap" di bawah bisa langsung
> dijadikan satu proposal OpenSpec terpisah (`openspec propose <nama-perubahan>`).

---

## 1. Proyek ini apa?

**JakartAgents** adalah platform agen AI otonom di **Mantle Network** untuk
**The Turing Test Hackathon 2026** (track yang dibidik: **Agentic Economy**, dengan
reposisi sekunder ke **AI DevTools / Agentic Wallets** — lihat `review-jakartagents-v2.md`).

Status saat ini (V1, sudah berjalan di repo):
- Dua jenis agen: **FX Agent** (sentimen makro stablecoin) dan **Yield Agent** (Merkl).
- Identitas agen on-chain via **ERC-8004** (`IdentityRegistry`, `ReputationRegistry`) di Mantle Sepolia.
- **AgentAttestationRegistry** — setiap run agen di-hash dan dicatat on-chain (sudah deployed).
- Eksekusi trading via `realclaw-executor.ts` (RealClaw / Byreal Skills CLI) — **status: scaffolded**, belum terhubung penuh ke `trade-executor.ts`.
- Dashboard Next.js + Fastify API + Supabase, cron 60s untuk siklus agent (monitor → analisis LLM → guardrails → eksekusi → attest).

**Visi V2** (`Dokumentasi_Konseptual_JakartAgents_V2.md`): mengubah JakartAgents dari
"bot" menjadi **No-Code AI Orchestration Platform** berbasis n8n, dengan tiga pilar:
1. **Intent-Centric Workflow Generation** — prompt bahasa natural → workflow n8n otomatis.
2. **Marketplace Strategi P2P** — user jual/sewa template strategi yang terbukti profit.
3. **Unified Orchestration Canvas** — semua agen (FX, Yield, Risk) jadi satu kanvas n8n drag-and-drop.

**Gap kritikal yang harus ditutup** (dari `review-jakartagents-v2.md`):
- Decision logic harus **ter-benchmark on-chain**, bukan cuma execution. (Sebagian sudah ada via attestation — perlu dipertajam jadi "decision hash" eksplisit.)
- **Custody** harus jelas: non-custodial via RealClaw/Privy (default) atau session key ERC-4337.
- Diksi yang menempatkan Byreal sebagai venue swap Mantle itu salah → ganti jadi "RealClaw / Byreal Skills CLI" + sebut venue (Merchant Moe / Agni / Fluxion).
- Klaim bahwa AI melakukan contract-risk check harus diubah jadi tx-simulation / GoPlus Security API.
- Positioning: jangan adu ROI — posisikan sebagai **no-code agent builder + marketplace dengan trust dari on-chain track record**.

---

## 2. Kriteria penilaian yang relevan (ringkas dari `Judging_Criteria_of_AI_Awakening.xlsx`)

**Part A — Mantle General (50 pts, semua track):**
- Technical (15): arsitektur, security, code quality, end-to-end di Mantle.
- Ecosystem fit (10): integrasi stack Mantle, aset DeFi/CeFi.
- Business potential (10): PMF, tokenomics, GTM.
- Innovation (10): orisinalitas, bukan fork.
- UX (5): onboarding, AA/gasless.

**Part B — Agentic Economy / Byreal track (50 pts):**
- Byreal integration depth (18) — pakai Agent Skills/Perps CLI/RealClaw secara substantif, bukan sekadar API call.
- Agent autonomy (14) — multi-step reasoning, eksekusi adaptif, autonomous error recovery.
- Use case clarity & validity (10).
- Verifiability & demo quality (8) — on-chain execution record / live demo.

**Implikasi untuk roadmap:** prioritas tertinggi = (1) selesaikan RealClaw integration
(Byreal depth + ecosystem fit), (2) perkuat on-chain decision attestation (verifiability),
(3) tunjukkan agent autonomy yang nyata (bukan sekadar cron yang manggil LLM sekali).
Fitur n8n/marketplace V2 menambah nilai di Innovation + Business potential, tapi
**jangan dikerjakan dengan mengorbankan poin 1–3 di atas** — itu fondasi yang langsung dinilai juri.

---

## 3. Struktur Tahap (untuk `openspec propose` satu per satu)

Urutan di bawah disusun dari **fix cepat & berisiko rendah** → **fitur inti hackathon** →
**fitur V2 (no-code/marketplace)**. Setiap tahap = satu proposal OpenSpec mandiri,
idealnya bisa di-ship dan didemo terpisah.

### Tahap 0 — Hygiene & Positioning (dokumentasi + wording, tanpa kode baru)
**Tujuan:** bersihkan klaim yang salah/menyesatkan sebelum submission, tanpa menyentuh fitur.
- Ganti semua sebutan yang menempatkan Byreal sebagai venue swap Mantle → "RealClaw / Byreal Skills CLI" + sebut venue eksekusi (Merchant Moe / Agni Finance / Fluxion).
- Update README/docs: tegaskan model custody (non-custodial via Privy/RealClaw).
- Reframe deskripsi pemeriksaan kontrak → "risk check via transaction simulation / GoPlus API, AI hanya untuk analisis sentiment".
- Set positioning copy ke "no-code agent builder untuk Mantle dengan trust dari on-chain track record" di README & pitch materials.
- **Definition of done:** tidak ada lagi referensi salah yang menempatkan Byreal sebagai venue swap Mantle atau klaim bahwa model AI melakukan contract-risk check di seluruh docs/README/UI copy.

### Tahap 1 — RealClaw Execution: dari scaffold ke live
**Tujuan:** menutup "Status: scaffolded" di `realclaw-executor.ts` — ini komponen Byreal-track paling berbobot (18 pts).
- Konfirmasi schema API live `openclaw.mantle.xyz` (Byreal Skills CLI).
- Implementasi `executeRealClawSwap()` end-to-end: request swap, handle Privy confirmation flow, parse hasil tx.
- Hubungkan ke `trade-executor.ts` sehingga trade Mantle benar-benar lewat RealClaw (bukan placeholder).
- Tangani error/fallback (retry, timeout, gagal konfirmasi user).
- Test: integration test dengan testnet Mantle Sepolia, swap kecil mUSDC↔mWMNT.
- **Definition of done:** satu siklus agent (FX atau Yield) menghasilkan swap on-chain nyata via RealClaw di Mantle Sepolia, tx hash tercatat di attestation.

### Tahap 2 — On-Chain Decision Attestation (perkuat verifiability)
**Tujuan:** sambungkan "decision logic" (LLM signal + guardrail eval), bukan cuma hasil eksekusi, ke on-chain record — ini yang dicari juri ("mana agent on-chain-nya?").
- Perluas `attestation-service.ts`: hash bukan cuma timeline event, tapi juga `decisionHash` (sinyal LLM + parameter guardrail yang dipakai) per keputusan — sesuai contoh `event AgentDecision` di `review-jakartagents-v2.md`.
- Tambah field/struct di `AgentAttestationRegistry.sol` jika perlu (atau gunakan event terpisah `AgentDecision`).
- Endpoint/UI untuk menampilkan "decision trail" per run: signal → guardrail check → execution → tx hash, semua bisa ditelusuri ke on-chain hash.
- **Definition of done:** dari dashboard, user bisa klik satu run agent dan melihat link/hash on-chain yang membuktikan signal+guardrail+outcome konsisten dengan apa yang terjadi.

### Tahap 3 — Agent Autonomy Showcase
**Tujuan:** naikkan skor "Agent autonomy" (14 pts) — tunjukkan multi-step reasoning & adaptive execution, bukan cuma "cron call LLM once".
- Tambah kemampuan agent untuk **adaptive retry / re-plan**: jika eksekusi gagal (slippage, honeypot flag, RealClaw error), agent re-evaluasi dan ambil tindakan alternatif (skip, kurangi size, ganti rute) — bukan cuma log error.
- Tambah "reasoning trace" yang disimpan ke timeline: alasan LLM untuk signal, alasan guardrail menolak/menerima, alasan fallback.
- Opsional: agent bisa menyesuaikan parameter sendiri dalam batas guardrail (mis. ukuran posisi berdasarkan confidence score) — didemokan sebagai "autonomous decision", bukan instruksi statis.
- **Definition of done:** ada minimal satu skenario terdemo di mana agent menghadapi kondisi tak ideal (mis. honeypot terdeteksi / slippage tinggi) dan secara mandiri mengambil tindakan korektif yang tercatat di timeline + attestation.

### Tahap 4 — Unified n8n Orchestration Canvas (V2 pilar 3)
**Tujuan:** mulai fondasi V2 — satukan FX/Yield/Risk agent ke kanvas n8n.
- Setup instance n8n (self-hosted atau cloud) terhubung ke API JakartAgents via webhook/REST.
- Bungkus fungsi-fungsi existing (`market-data-service`, `llm-analyzer`, `rules-engine`, `trade-executor`, `attestation-service`) sebagai **n8n custom nodes / HTTP nodes** yang bisa dirangkai user.
- Buat 1-2 template workflow contoh (mis. "FX Agent default flow") yang bisa di-clone & dimodifikasi user di kanvas.
- UI: embed/link kanvas n8n di dashboard (`apps/web`), dengan SSO dari sesi user yang sama.
- **Definition of done:** user login bisa membuka kanvas n8n dari dashboard, melihat workflow agent default mereka sebagai node-node visual, dan memodifikasi minimal satu parameter (mis. threshold) lalu menjalankannya.

### Tahap 5 — Intent-Centric Workflow Generation (V2 pilar 1)
**Tujuan:** AI assistant menerjemahkan prompt natural language → workflow n8n.
- Endpoint baru `apps/api`: terima prompt user (mis. "rotasi modal ke token Mantle jika volume naik 15%/jam dan sentimen positif").
- LLM (Gemini, reuse `llm-analyzer.ts` pattern) men-generate **n8n workflow JSON** dari template node yang sudah ada di Tahap 4.
- Validasi: workflow hasil generate harus melewati guardrail check (tidak boleh bypass limit, harus include node risk-check) sebelum bisa di-deploy ke kanvas user.
- UI chatbot di dashboard untuk input prompt + preview workflow yang dihasilkan sebelum user konfirmasi.
- **Definition of done:** user mengetik satu prompt strategi dalam bahasa natural, sistem menghasilkan workflow n8n yang valid (lulus guardrail), dan user bisa langsung menjalankannya dari kanvas.

### Tahap 6 — Marketplace Strategi P2P (V2 pilar 2)
**Tujuan:** monetisasi template workflow, dengan trust dari on-chain track record (Tahap 2).
- Skema DB (Supabase): tabel `strategy_templates` (owner, workflow JSON, harga sewa, status), `strategy_rentals`, link ke `agent_attestations` untuk track record.
- Hanya strategi dengan **minimum N run attestasi on-chain** & ROI terverifikasi yang boleh listing (mitigasi survivorship bias / pump-and-dump sesuai poin #6 review).
- Flow: publish → discovery (listing dengan badge "on-chain verified" + ringkasan performa) → sewa/beli → clone workflow ke kanvas penyewa.
- Revenue split: take rate platform (%) dicatat — implementasi sederhana dulu (mis. via Supabase ledger), on-chain settlement opsional untuk tahap berikutnya.
- **Definition of done:** ada minimal satu strategi yang dipublish dengan track record on-chain yang bisa dilihat, dan satu user lain bisa "menyewa"/clone strategi tersebut ke kanvas mereka sendiri.

### Tahap 7 — UX & Onboarding (AA/Gasless)
**Tujuan:** naikkan poin UX (5 pts) — turunkan friksi onboarding Web2→Web3.
- Account abstraction / gasless tx untuk aksi non-trading (mis. publish strategi, lihat dashboard) jika memungkinkan via Mantle stack.
- Onboarding flow: SIWE sudah ada — tambah panduan in-app step-by-step untuk wallet baru (faucet testnet, link, dsb).
- Polish dashboard: status RealClaw connection, status custody, link explorer untuk setiap attestation.
- **Definition of done:** user baru tanpa pengalaman Web3 bisa connect wallet, lihat agent berjalan, dan memahami status on-chain mereka tanpa dokumentasi eksternal.

---

## 4. Cara pakai dengan OpenSpec

Setiap tahap punya file detail tersendiri di `docs/openspec/`, berisi: kenapa, scope
(in/out), perubahan konkret per file, acceptance criteria, **rencana testing**
(unit/integration/manual), dan definition of done. Referensikan file tahap terkait
saat `openspec propose`:

| Tahap | File detail | Perintah |
|---|---|---|
| 0 | `docs/openspec/00-hygiene-positioning-fix.md` | `openspec propose hygiene-positioning-fix` |
| 1 | `docs/openspec/01-realclaw-execution-live.md` | `openspec propose realclaw-execution-live` |
| 2 | `docs/openspec/02-onchain-decision-attestation.md` | `openspec propose onchain-decision-attestation` |
| 3 | `docs/openspec/03-agent-autonomy-showcase.md` | `openspec propose agent-autonomy-showcase` |
| 4 | `docs/openspec/04-n8n-orchestration-canvas.md` | `openspec propose n8n-orchestration-canvas` |
| 5 | `docs/openspec/05-intent-workflow-generation.md` | `openspec propose intent-workflow-generation` |
| 6 | `docs/openspec/06-strategy-marketplace.md` | `openspec propose strategy-marketplace` |
| 7 | `docs/openspec/07-ux-onboarding-aa.md` | `openspec propose ux-onboarding-aa` |

**Urutan eksekusi disarankan:** `0 → 1 → 2 → 3` dulu (fondasi hackathon yang dinilai
langsung oleh kriteria Agentic Economy/Byreal), baru `4 → 5 → 6` (fitur V2/no-code,
masing-masing bergantung pada tahap sebelumnya — lihat "Bergantung pada" di tiap
file). `7` independen, bisa diselipkan kapan saja.

Setiap proposal sebaiknya mengutip section terkait dari file detailnya sebagai
konteks "why"/"scope", lalu OpenSpec spec/tasks fokus ke breakdown implementasi +
checklist testing yang sudah disiapkan di file tersebut.
