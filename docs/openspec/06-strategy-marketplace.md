# 06 — Marketplace Strategi P2P

> Referensi untuk: `openspec propose strategy-marketplace`
> Sumber: `Dokumentasi_Konseptual_MantleAgents_V2.md` §2.2, §4 (langkah 4);
> `review-mantleagents-v2.md` poin #6 (mitigasi risiko marketplace)
> Bergantung pada: Tahap 2 (on-chain track record) dan Tahap 4 (kanvas n8n untuk clone workflow)

## 1. Kenapa tahap ini ada

Pilar V2 #2 — revenue model + network effect. Tapi review mengidentifikasi 3 risiko
nyata yang **harus** dimitigasi sejak desain awal, bukan ditambal belakangan:

- **Distributed alpha = dead alpha** — strategi populer → herding → slippage makan
  alpha sendiri.
- **Survivorship bias** — strategi "berhasil" di kondisi pasar tertentu dijual ke
  buyer yang rugi di kondisi lain.
- **Vektor pump-and-dump** — "strategi" yang sebenarnya menjadikan renter sebagai
  exit liquidity.

Mitigasi inti (dari review): **listing hanya boleh untuk strategi dengan on-chain
track record terverifikasi** (dari Tahap 2) — bukan klaim sepihak. Ini sekaligus
"angle paling kuat untuk ditonjolkan ke juri".

## 2. Scope

**In scope:**
- Skema DB (Supabase, migration baru):
  - `strategy_templates` (id, owner_wallet, workflow_json, title, description,
    rental_price, status: `draft|listed|delisted`, min_attestations_required,
    created_at)
  - `strategy_performance_snapshots` (strategy_id, period_start, period_end,
    roi_pct, run_count, attestation_ids[]) — agregasi dari `agent_attestations`
    (Tahap 2)
  - `strategy_rentals` (id, strategy_id, renter_wallet, price_paid, started_at,
    expires_at\|null)
- **Listing eligibility check**: strategi hanya bisa status `listed` jika
  `attestation_count >= min_attestations_required` (konfigurasi global, mis. 10 run)
  DAN performance snapshot mencakup **rentang waktu minimum** (mis. ≥ 7 hari) untuk
  mengurangi survivorship bias dari "lucky streak" pendek.
- **Disclosure wajib di listing UI**: tampilkan periode track record, jumlah run,
  ROI, dan **disclaimer** "past performance ≠ future results" + link ke semua
  attestation on-chain individual (bukan cuma agregat).
- Endpoints (`apps/api/src/routes/marketplace.ts` — baru):
  - `POST /marketplace/strategies` (publish, dengan eligibility check)
  - `GET /marketplace/strategies` (listing dengan filter performa)
  - `POST /marketplace/strategies/:id/rent` (sewa → clone `workflow_json` ke kanvas
    n8n penyewa via API Tahap 4)
- Revenue split: take rate platform (%) dicatat sebagai entry di
  `strategy_rentals` (`platform_fee`), settlement on-chain **opsional/di luar
  scope** untuk versi awal (catat sebagai future work).

**Out of scope:**
- On-chain settlement pembayaran sewa (bisa pakai mUSDC transfer manual/testnet
  untuk demo, tapi smart contract escrow bukan syarat MVP).
- Sistem rating/review user-to-user (bisa jadi iterasi lanjutan).

## 3. Perubahan konkret

| Komponen | Perubahan |
|---|---|
| `supabase/migrations/` | Tabel `strategy_templates`, `strategy_performance_snapshots`, `strategy_rentals` + RLS policy (owner write, public read untuk listed) |
| `apps/api/src/services/strategy-eligibility.ts` (baru) | Hitung `attestation_count`, rentang waktu, ROI dari `agent_attestations` (Tahap 2); tentukan eligible/tidak |
| `apps/api/src/routes/marketplace.ts` (baru) | CRUD listing + rent endpoint |
| `apps/web/src/.../marketplace` | Halaman listing (grid card dengan badge "On-chain Verified", ROI, periode), halaman detail (link ke tiap attestation) |
| `apps/api/src/services/strategy-clone.ts` (baru) | Clone `workflow_json` ke n8n instance/kanvas penyewa (pakai n8n API dari Tahap 4) |

## 4. Acceptance Criteria

- [ ] Strategi dengan attestation count < `min_attestations_required` **tidak bisa**
      di-publish (`POST /marketplace/strategies` mengembalikan error eligibility).
- [ ] Listing card menampilkan: ROI agregat, jumlah run, rentang tanggal track
      record, dan link ke **setiap** attestation individual (bukan cuma summary).
- [ ] `POST /marketplace/strategies/:id/rent` berhasil meng-clone `workflow_json` ke
      kanvas n8n milik renter (terverifikasi via Tahap 4 API) dan mencatat row di
      `strategy_rentals`.
- [ ] RLS Supabase: user lain tidak bisa mengubah `strategy_templates` milik user
      lain; hanya `status: listed` yang terlihat di listing publik.
- [ ] Disclaimer "past performance ≠ future results" muncul di setiap halaman
      detail strategi.

## 5. Testing

### Unit tests (`strategy-eligibility.test.ts` — baru)
- Mock `agent_attestations` dengan jumlah run < threshold → `eligible: false`,
  reason "insufficient track record".
- Mock dengan jumlah run cukup tapi rentang waktu < minimum (mis. semua run dalam 1
  hari) → `eligible: false`, reason "track record period too short".
- Mock dengan run cukup + rentang waktu cukup → `eligible: true`, dan
  `roi_pct`/`run_count` dihitung benar dari data attestation (test perhitungan
  agregasi dengan beberapa kasus angka).

```bash
cd apps/api && pnpm vitest run src/services/strategy-eligibility.test.ts
```

### Integration tests (`marketplace.test.ts` — baru, pola mengikuti `agent.test.ts`)
- `POST /marketplace/strategies` dengan strategi tidak eligible → 4xx + pesan
  eligibility, tidak membuat row `status: listed`.
- `POST /marketplace/strategies` dengan strategi eligible → row dibuat dengan
  `status: listed`.
- `GET /marketplace/strategies` → hanya mengembalikan strategi `status: listed`,
  termasuk strategi milik user lain (public read), tidak termasuk `draft`/`delisted`.
- `POST /marketplace/strategies/:id/rent`:
  - Mock `strategy-clone` service → pastikan dipanggil dengan `workflow_json` yang
    benar dan target = kanvas n8n renter.
  - Pastikan row `strategy_rentals` dibuat dengan `platform_fee` dihitung sesuai
    konfigurasi take rate.

```bash
cd apps/api && pnpm vitest run src/routes/marketplace.test.ts
```

### RLS tests (Supabase)
- Test query langsung ke Supabase (pakai test client dengan JWT user A) mencoba
  `UPDATE strategy_templates` milik user B → harus ditolak RLS.
- Test `SELECT` ke `strategy_templates` dengan `status: draft` milik user lain →
  hasil kosong untuk user yang bukan owner.

### Manual / demo verification
1. Jalankan agent (Tahap 1-3) sampai punya ≥ `min_attestations_required` run dengan
   ROI positif (testnet, bisa percepat dengan menurunkan threshold di env demo).
2. Publish strategi dari dashboard → muncul di `/marketplace` dengan badge verified +
   link attestation.
3. Login sebagai user kedua (wallet berbeda) → buka `/marketplace`, sewa strategi
   tersebut.
4. Buka kanvas n8n user kedua (Tahap 4) → pastikan workflow strategi ter-clone dan
   bisa dijalankan.
5. Coba publish strategi yang baru punya 1-2 run → pastikan ditolak dengan pesan
   eligibility yang jelas.

## 6. Definition of Done

Ada minimal satu strategi dengan track record on-chain terverifikasi yang
dipublish, dan satu user lain bisa menyewa/clone strategi tersebut ke kanvas mereka
sendiri — dengan disclosure performa yang jujur (termasuk disclaimer) sesuai
mitigasi risiko di `review-mantleagents-v2.md` poin #6.
