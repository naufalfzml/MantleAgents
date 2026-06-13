# 01 — RealClaw Execution: Scaffold → Live

> Referensi untuk: `openspec propose realclaw-execution-live`
> Sumber: `CLAUDE.md` §"Mantle Execution"; `apps/api/src/services/realclaw-executor.ts`;
> `apps/api/src/services/trade-executor.ts`; judging criteria "Byreal integration depth" (18 pts, terbesar di track Agentic Economy)

## 1. Kenapa tahap ini ada

Ini komponen dengan bobot penilaian tertinggi di track Agentic Economy/Byreal
(18/50 poin Part B). Status saat ini menurut `CLAUDE.md`:

> **Status: scaffolded, pending confirmation of the live API schema** at
> openclaw.mantle.xyz before wiring into `trade-executor.ts`.

Artinya `executeRealClawSwap()` ada tapi belum jadi jalur eksekusi nyata. Tanpa ini,
"on-chain execution" yang diklaim di README untuk Mantle sebenarnya belum terbukti
end-to-end via Byreal — risiko besar saat juri tanya langsung.

## 2. Scope

**In scope:**
- `apps/api/src/services/realclaw-executor.ts` — implementasi penuh `executeRealClawSwap()`
  sesuai schema API live `openclaw.mantle.xyz` (Byreal Skills CLI / RealClaw).
- `apps/api/src/services/trade-executor.ts` — pastikan `executeTrade()` /
  `executeSwap()` benar-benar memanggil `realclaw-executor` untuk chain Mantle saat
  `isRealClawConfigured()` true, dengan fallback yang jelas (bukan silent no-op) saat
  tidak terkonfigurasi.
- Handling **Privy non-custodial confirmation flow**: request → user/agent confirm →
  poll status → parse tx hash.
- Error handling: timeout, gagal konfirmasi, RealClaw API error → harus menghasilkan
  event timeline yang informatif (bukan exception mentah ke cron loop).

**Out of scope:**
- Perubahan guardrail logic (`rules-engine.ts`) — itu input ke executor, tidak diubah di sini.
- Decision attestation enhancement (Tahap 2).

## 3. Perubahan konkret

1. **Konfirmasi schema API**: dokumentasikan endpoint, auth, request/response shape
   dari `openclaw.mantle.xyz` di komentar atas `realclaw-executor.ts` (atau file
   `docs/REALCLAW_API.md` baru) — termasuk contoh payload request swap dan response
   sukses/gagal.
2. **Implementasi `executeRealClawSwap(params)`**:
   - Input: `{ tokenIn, tokenOut, amountIn, walletAddress, maxSlippageBps }`.
   - Output sukses: `{ status: 'success', txHash: string, amountOut: string }`.
   - Output gagal: `{ status: 'failed' | 'pending_confirmation' | 'error', reason: string }`.
3. **`isRealClawConfigured()`**: cek env vars yang dibutuhkan (API key/base URL),
   throw/log jelas saat startup jika Mantle execution diaktifkan tapi config kosong
   (fail-loud, sesuai pola `chains.ts`).
4. **Wiring di `trade-executor.ts`**: untuk chain Mantle, panggil
   `executeRealClawSwap`; map hasil ke event timeline (`trade`, `trade_failed`,
   `trade_pending`).
5. **Retry/backoff sederhana** untuk error transient (network/5xx), tanpa retry untuk
   error permanen (insufficient balance, slippage exceeded).

## 4. Acceptance Criteria

- [ ] `isRealClawConfigured()` mengembalikan `true` di environment dengan env vars
      RealClaw lengkap, `false` + log warning jika tidak.
- [ ] `executeRealClawSwap()` terhadap testnet Mantle Sepolia menghasilkan tx hash
      valid yang bisa dilihat di explorer Mantle Sepolia.
- [ ] Saat RealClaw mengembalikan error, `trade-executor.ts` tidak melempar exception
      yang menghentikan cron — error tercatat sebagai event `trade_failed` dengan
      `reason`.
- [ ] `CLAUDE.md` diupdate: hapus status "scaffolded, pending confirmation" → ganti
      dengan ringkasan implementasi final.

## 5. Testing

### Unit tests (`apps/api/src/services/realclaw-executor.test.ts` — baru)
Pola mengikuti `trade-executor.test.ts` yang sudah ada (mock fetch / HTTP client):
- Mock response sukses → pastikan `executeRealClawSwap` mengembalikan `{status:'success', txHash,...}` dengan parsing field yang benar.
- Mock response error 4xx (mis. insufficient liquidity) → pastikan map ke `{status:'failed', reason}`.
- Mock timeout/5xx → pastikan retry dipanggil sesuai konfigurasi, lalu `{status:'error'}` setelah retry habis.
- Mock `pending_confirmation` (Privy belum konfirmasi) → pastikan executor melakukan polling sampai status final atau timeout.

```bash
cd apps/api && pnpm vitest run src/services/realclaw-executor.test.ts
```

### Integration tests (`trade-executor.test.ts` — extend)
- Tambah kasus: chain = Mantle, `isRealClawConfigured() = true` → pastikan
  `executeTrade()` memanggil `executeRealClawSwap` (spy/mock), bukan jalur
  `@mantleagents/mantle-data` non-Mantle.
- Tambah kasus: `isRealClawConfigured() = false` → pastikan behaviour fallback
  eksplisit (event `trade_skipped` dengan reason "RealClaw not configured"), bukan
  silent failure.

```bash
cd apps/api && pnpm vitest run src/services/trade-executor.test.ts
```

### End-to-end manual test (Mantle Sepolia, sebelum demo)
1. Set env RealClaw di `.env` (testnet credentials).
2. Jalankan `pnpm --filter @mantleagents/api dev`.
3. Trigger satu agent run manual (via endpoint admin atau tunggu cron 60s) dengan
   guardrail yang pasti menghasilkan signal "buy" kecil (mis. mUSDC → mWMNT, $5 testnet).
4. Verifikasi:
   - Tx muncul di Mantle Sepolia explorer dengan alamat wallet agent.
   - Event `trade` muncul di `fx_agent_timeline` / `yield_agent_timeline` dengan `tx_hash` terisi.
   - Tidak ada exception di log API.

## 6. Definition of Done

Satu siklus agent (FX atau Yield) menghasilkan swap on-chain nyata via RealClaw di
Mantle Sepolia, tx hash tercatat di timeline, dan `CLAUDE.md` tidak lagi menyebut
status "scaffolded".
