# Review JakartAgents V2 — Turing Test Hackathon 2026 (Mantle)

**Verdict singkat:** Konsep produk kuat dan positioning fase-nya sudah benar (AI Awakening / Phase 2). Ide inti — intent-to-workflow generation dan marketplace P2P — layak jalan. Yang perlu dibenahi sebelum submission mayoritas sifatnya penajaman, bukan rombak total. Dua hal paling kritikal: **alignment ke on-chain agent benchmarking** (tema utama hackathon) dan **kejelasan model custody**.

---

## READY TO GO (pertahankan)

- **Intent-Centric Workflow Generation** — fitur terkuat. Natural language ke template n8n adalah UX unlock nyata dan sejalan dengan tren no-code agent saat ini. Ini diferensiator utama, jangan dikecilin.
- **Marketplace Strategi P2P** — revenue model + network effect yang konkret, bukan sekadar "bot trading ke-1000". Pertahankan sebagai pilar.
- **Unified Orchestration Canvas** — menyatukan agent yang sebelumnya terfragmentasi = product thinking yang matang.
- **Build di atas n8n** — pragmatis untuk hackathon, time-to-MVP cepat, tidak perlu reinvent orchestration engine.
- **Targeting fase yang benar** — AI Awakening (Phase 2). Phase 1 (ClawHack) sudah tutup 30 April 2026.
- **Struktur dokumen & business framing** — jelas dan mudah dibaca.

---

## PERLU ADJUST (urut prioritas)

### 1. Diksi "Byreal API/DEX Mantle" — perjelas (fix mudah, hanya wording)

Byreal punya dua hal berbeda yang ketuker di dokumen:

- **DEX Byreal** ada di **Solana**, bukan Mantle.
- **Agent layer Byreal** (RealClaw + OpenClaw + Byreal Skills CLI) jalan di **Mantle** — dan ini yang relevan untuk hackathon (`openclaw.mantle.xyz`). RealClaw juga sudah non-custodial via Privy (lihat poin #3).

**Action:** ganti "Byreal API/DEX Mantle" menjadi "Byreal agent layer (RealClaw / Byreal Skills CLI) di Mantle". Untuk eksekusi swap on-chain di Mantle, venue DEX-nya adalah **Merchant Moe / Agni Finance / Fluxion** (RealClaw route ke sana). Catatan: Mantle = EVM L2, jadi stack Solidity/EVM langsung kepake — **jangan pivot ke Solana**.

### 2. Alignment ke on-chain agent benchmarking (PALING PENTING)

Headline hackathon ini: setiap keputusan dan hasil agent **direkam permanen on-chain di Mantle**. Di arsitektur saat ini, logika "AI decision" hidup di n8n (off-chain, server sendiri); yang menyentuh chain hanya execution node. Artinya decision logic tidak ter-benchmark on-chain — padahal itu justru kriteria inti yang dinilai. Juri dari Nansen/Allora/Virtuals kemungkinan besar akan tanya "mana agent on-chain-nya?".

**Tradeoff:** full on-chain agent = mahal & lambat di-dev; hybrid (decision off-chain + commitment on-chain) = realistis.

**Rekomendasi default:** commit setiap decision + outcome sebagai event/hash ke contract di Mantle. Ini menyambungkan n8n ke tema hackathon sekaligus jadi pondasi track record verifiable (lihat poin #6).

```solidity
// Auditable decision trail di Mantle
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

### 3. Custody / key management — perjelas (security)

Dokumen menyebut auto-execute (beli, stop-loss, auto-sell) tapi tidak menjelaskan custody. Kalau private key disimpan di n8n credentials untuk auto-exec, ini risiko fatal: satu kompromi pada instance n8n = semua dana user hilang.

Dua opsi, pilih sesuai arsitektur:

- **(Default, paling cepat)** Pakai RealClaw / Byreal Skills CLI sebagai execution layer. Sudah **non-custodial via Privy** + confirmation flow, jadi custody beres tanpa effort tambahan dan otomatis nyambung ke sponsor tooling.
- **(Kalau eksekusi mandiri di n8n)** Smart account (ERC-4337) + session key dengan scoped permission. User melakukan delegate, bukan menyerahkan raw key.

```solidity
// Session key scope — BUKAN full custody
struct Permission {
    address[] allowedTargets;   // hanya router Merchant Moe / Agni
    uint256   maxValuePerTx;    // cap nominal per transaksi
    uint256   validUntil;       // auto-expire
    bytes4[]  allowedSelectors; // hanya swapExactTokensFor...
}
```

### 4. n8n latency vs penilaian ROI — soal positioning

Track trading dinilai berdasarkan trading volume + ROI. n8n berbasis polling/webhook/queue, jadi latency-nya di level detik, bukan milidetik. Untuk entry yang momentum-sensitive, ini akan kalah melawan agent loop Python/Solidity yang ketat.

**Tradeoff:** n8n menang di UX no-code, kalah di kecepatan eksekusi.

**Rekomendasi:** jangan jualan "ROI tercepat" — itu lawan kekuatan sendiri. Posisikan di track **AI DevTools / Agentic Wallets** (no-code builder + marketplace). Di situ n8n defensible.

### 5. "AI detect honeypot" — secara konsep keliru

Honeypot detection itu **transaction simulation**, bukan tugas LLM: simulasi sell via `eth_call`/Tenderly, cek transfer restriction, blacklist, hidden mint, dan ownership function. Gunakan **GoPlus Security API** atau simulasi sell langsung. Klaim "AI mendeteksi honeypot" memberi false confidence ke user — kalau ada yang kena rug karena itu, reputasi platform rusak. AI untuk analisis sentiment/narrative boleh; untuk safety check, jangan.

### 6. Risiko marketplace — mitigasi, dan jadikan kekuatan

Tiga lubang nyata:

- **Distributed alpha = dead alpha** — begitu strategi laku dan banyak yang menjalankan sinyal yang sama, herding bikin slippage memakan alpha-nya sendiri.
- **Survivorship bias** — strategi yang "berhasil" di satu kondisi pasar dijual, buyer rugi saat kondisi berbeda.
- **Vektor pump-and-dump** — orang menjual "strategi" yang sebenarnya menyalurkan renter menjadi exit liquidity dia.

**Mitigasi:** manfaatkan on-chain recording dari hackathon — strategi hanya bisa dijual kalau punya **verifiable on-chain track record**, bukan klaim sepihak. Ini sekaligus memitigasi survivorship bias dan nyambung ke tema hackathon. Angle paling kuat untuk ditonjolkan ke juri.

---

## Rekomendasi Positioning

Masuk lewat track **AI DevTools / Agentic Wallets**, bukan adu ROI. Pitch: *"No-code agent builder untuk Mantle, dengan marketplace yang trust-nya berasal dari on-chain track record."* Ini main di kekuatan (no-code + marketplace) dan tidak head-to-head melawan bot ROI murni.

---

## Checklist Sebelum Submit

- [ ] Ganti diksi "Byreal DEX Mantle" → RealClaw / Byreal Skills CLI; sebut venue eksekusi (Merchant Moe / Agni / Fluxion)
- [ ] Tambahkan mekanisme commit decision + outcome on-chain ke contract Mantle
- [ ] Tegaskan model custody (Privy via RealClaw, atau session key ERC-4337)
- [ ] Reframe honeypot check menjadi tx simulation / GoPlus, bukan "AI"
- [ ] Set positioning ke track DevTools / Agentic Wallets di narasi
- [ ] Tambahkan on-chain track record sebagai trust layer marketplace

---

## Sumber (untuk verifikasi tim)

- Byreal = DEX Solana: https://docs.byreal.io/
- RealClaw (agent layer, non-custodial via Privy) + ClawHack di Mantle: https://openclaw.mantle.xyz/
- Turing Test Hackathon 2026 (tracks & fase): https://dorahacks.io/hackathon/mantleturingtesthackathon2026
- Byreal Skills CLI (OpenClaw skills): https://github.com/byreal-git/byreal-agent-skills