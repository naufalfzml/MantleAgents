# 02 — On-Chain Decision Attestation

> Referensi untuk: `openspec propose onchain-decision-attestation`
> Sumber: `review-mantleagents-v2.md` poin #2 (PALING PENTING);
> `apps/api/src/services/attestation-service.ts`;
> `packages/contracts/contracts/AgentAttestationRegistry.sol`

## 1. Kenapa tahap ini ada

Kutipan dari review:

> Headline hackathon ini: setiap keputusan dan hasil agent **direkam permanen
> on-chain di Mantle**. Di arsitektur saat ini, logika "AI decision" hidup di n8n/cron
> (off-chain); yang menyentuh chain hanya execution node. Decision logic tidak
> ter-benchmark on-chain.

Saat ini `attestation-service.ts` (`createAndAttachRunAttestation`) sudah meng-hash
**timeline events** (`event_type`, `summary`, `tx_hash`, `created_at`) jadi
`eventsHash`, di-HMAC-sign, dan disimpan ke Supabase (`agent_attestations`). Tapi:
- `eventsHash` adalah hash dari **summary string**, bukan dari **input keputusan**
  (signal LLM + parameter guardrail yang dipakai saat itu).
- Belum ada konfirmasi bahwa hash ini benar-benar **dicommit ke
  `AgentAttestationRegistry` on-chain** secara rutin (perlu dicek — kalau baru
  tersimpan di Supabase saja, ini hanya "off-chain attestation").

Tahap ini menambahkan **`decisionHash`** eksplisit per keputusan, sesuai contoh di
review:

```solidity
event AgentDecision(
    address indexed agent,
    bytes32 indexed strategyId,
    bytes32 decisionHash,   // hash dari sinyal + parameter yang dipakai
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 timestamp
);
```

## 2. Scope

**In scope:**
- `apps/api/src/services/attestation-service.ts`:
  - Tambah fungsi `computeDecisionHash(input)` — hash dari `{ signal: {action, confidence, reasoning}, guardrailParams: {...}, marketDataSnapshot: {...} }`.
  - Sertakan `decisionHash` di `AttestationPayload` (field baru, tidak hapus `eventsHash`).
- `apps/api/src/services/agent-cron.ts`:
  - Setelah `llm-analyzer.ts` menghasilkan signal dan `rules-engine.ts` mengevaluasi
    guardrail, **simpan snapshot input keputusan** (signal + guardrail params + market
    data ringkas) ke timeline event sebelum eksekusi — supaya bisa di-hash.
- **Verifikasi/implementasi commit on-chain**: pastikan
  `createAndAttachRunAttestation` (atau fungsi baru `commitAttestationOnChain`)
  benar-benar memanggil `AgentAttestationRegistry` di Mantle (via viem,
  pola sama dengan `agent-registry.ts`) — bukan cuma simpan ke Supabase.
- Contract: jika `AgentAttestationRegistry.sol` belum punya field/event untuk
  `decisionHash` terpisah dari `eventsHash`, tambahkan (atau gunakan satu hash
  gabungan — putuskan & dokumentasikan di proposal).
- API endpoint baru/extend: `GET /agent/:agentType/attestations/:id` mengembalikan
  `decisionHash`, `eventsHash`, dan link tx commit on-chain.
- UI: di halaman riwayat run agent, tampilkan badge "Verified on-chain" dengan link
  ke tx commit attestation di explorer Mantle Sepolia.

**Out of scope:**
- Mengubah `IdentityRegistry`/`ReputationRegistry` (sudah live, tidak disentuh).
- Tahap 3 (autonomy) — tahap ini hanya soal *recording*, bukan *behavior* agent.

## 3. Perubahan konkret

| File | Perubahan |
|---|---|
| `attestation-service.ts` | + `computeDecisionHash()`, + field `decisionHash` di `AttestationPayload`, + fungsi commit on-chain (viem call ke `AgentAttestationRegistry`) jika belum ada |
| `agent-cron.ts` | Simpan event `decision_input` ke timeline berisi snapshot signal+guardrail+market data sebelum eksekusi |
| `AgentAttestationRegistry.sol` | (jika perlu) tambah field `decisionHash bytes32` di struct/event attestation |
| `apps/api/src/abis/attestation-registry.ts` | Update ABI sesuai perubahan contract |
| `apps/web` | Halaman/komponen "Run Detail": tampilkan decision trail (signal → guardrail → execution → on-chain hash) |

## 4. Acceptance Criteria

- [ ] Setiap run yang menghasilkan attestation memiliki `decisionHash` yang
      deterministik dari input keputusan (re-run hash function dengan input sama →
      hash sama).
- [ ] Attestation (eventsHash + decisionHash + runId + agentId) ter-commit ke
      `AgentAttestationRegistry` di Mantle Sepolia — bisa diverifikasi via tx hash di
      explorer.
- [ ] Dashboard menampilkan link verifikasi on-chain per run, dan link tersebut
      membuka data yang konsisten dengan apa yang ditampilkan di UI (signal,
      guardrail check, hasil eksekusi).
- [ ] Jika contract diubah, ada deploy script baru
      (`pnpm --filter @mantleagents/contracts deploy:attestation-registry`) dan
      alamat baru terdokumentasi di README (tabel Mantle Integration).

## 5. Testing

### Unit tests (`attestation-service.test.ts` — baru/extend)
- `computeDecisionHash()`:
  - Input sama → hash sama (determinism).
  - Urutan key berbeda di object input → hash tetap sama (pastikan pakai
    `stableStringify` yang sudah ada di file ini).
  - Input berbeda (mis. confidence score beda) → hash berbeda.
- `createAndAttachRunAttestation()`:
  - Mock Supabase timeline dengan event `decision_input` + event eksekusi → pastikan
    `payload.decisionHash` terisi dan berbeda dari `eventsHash`.
  - Mock kasus tanpa event `decision_input` (data lama/backfill) → `decisionHash`
    boleh `null`, tidak boleh crash.

```bash
cd apps/api && pnpm vitest run src/services/attestation-service.test.ts
```

### Contract tests (jika `AgentAttestationRegistry.sol` diubah)
- Tambah/update test Hardhat/Foundry di `packages/contracts` (cek struktur test yang
  ada — ikuti pola existing untuk `MockERC20`/registry).
- Test: commit attestation dengan `decisionHash` baru → event `AgentDecision` (atau
  field setara) ter-emit dengan value yang benar; commit dua kali dengan `runId` sama
  → behaviour sesuai spec (reject duplikat atau allow update — putuskan & test).

```bash
cd packages/contracts && pnpm test
```

### Integration test — commit on-chain (testnet)
- Test terpisah (boleh `*.integration.test.ts`, di-skip di CI biasa, dijalankan
  manual) yang benar-benar memanggil Mantle Sepolia:
  1. Buat attestation dummy.
  2. Commit ke `AgentAttestationRegistry` via viem dengan wallet testnet.
  3. Baca kembali dari contract (`getAttestation(runId)` atau setara) → bandingkan
     hash tersimpan dengan yang dihitung lokal.

```bash
cd apps/api && pnpm vitest run src/services/attestation-onchain.integration.test.ts
```

### Manual / demo verification
1. Jalankan satu agent run (bisa reuse hasil dari Tahap 1).
2. Buka dashboard → Run Detail → pastikan ada link "View on-chain attestation".
3. Klik link → buka Mantle Sepolia explorer → cocokkan `decisionHash` on-chain
   dengan yang ditampilkan di UI (bisa cocokkan via tooltip/copy hash).

## 6. Definition of Done

Dari dashboard, user bisa membuka satu run agent dan melihat hash on-chain yang
membuktikan signal + guardrail params + outcome konsisten dengan apa yang terjadi —
dan hash tersebut benar-benar ada di `AgentAttestationRegistry` di Mantle Sepolia
(bukan hanya di Supabase).
