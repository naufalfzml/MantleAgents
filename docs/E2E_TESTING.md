# End-to-End Testing Guide

Pastikan sebelum mulai:

- `pnpm dev` sudah jalan (API :4000, Web :3000)
- `docker compose up n8n` sudah jalan (:5678)
- Wallet Metamask/Rabby terinstall di browser, sudah switch ke **Mantle Sepolia Testnet** (chainId 5003)

---

## 1. Onboarding

**URL**: http://localhost:3000

- [x] Buka homepage, pastikan landing page muncul
- [x] Klik Connect Wallet → pilih wallet → approve di browser extension
- [x] Redirect ke `/onboarding` setelah connect
- [x] Step 1 (Connect Wallet) otomatis ter-centang
- [x] Step 2 (Fund) — cek apakah ada link faucet Mantle Sepolia; fund wallet jika perlu di https://faucet.mantle.xyz
- [x] Step 3 (Register Agent) — klik Register, approve transaksi di wallet
- [x] Setelah register, muncul `agentId` (ERC-8004 token ID)
- [x] Redirect ke `/overview` setelah onboarding selesai
- [x] Session tetap valid setelah page refresh (tidak redirect ulang ke connect/onboarding)

---

## 2. Overview

**URL**: http://localhost:3000/overview

- [x] Portfolio value muncul (boleh 0)
- [x] FX Agent status card muncul
- [x] Yield Agent status card muncul
- [x] Trending FX pairs muncul (harga $0 normal untuk mock tokens Mantle Sepolia)

---

## 3. FX Agent

**URL**: http://localhost:3000/fx-agent

- [ ] Agent config tersimpan (pair, risk level, dll)
- [ ] Klik "Start Agent" / toggle aktif
- [ ] Tunggu max 60 detik untuk agent tick pertama
- [ ] Timeline muncul event: `decision_input`, `signal`, `guardrail_check`
- [ ] Jika trade terjadi: event `trade` muncul dengan tx hash swap Mantle Sepolia
- [ ] Attestation muncul di timeline dengan `eventsHash`

---

## 4. Yield Agent

**URL**: http://localhost:3000/yield-agent

- [ ] Yield opportunities muncul
- [ ] Bisa konfigurasi yield strategy
- [ ] Agent tick menghasilkan timeline events

---

## 5. Monitor (Watchlist & Alerts)

**URL**: http://localhost:3000/monitor

- [ ] Tambah token ke watchlist (masukkan contract address token Mantle Sepolia)
- [ ] Risk check otomatis jalan setelah token ditambah
- [ ] Tambah price alert (above/below threshold)
- [ ] Tunggu 30 detik — cek apakah alert trigger jika kondisi terpenuhi

---

## 6. Swap

**URL**: http://localhost:3000/swap

- [ ] Pilih token dari/ke
- [ ] Masukkan amount
- [ ] Preview swap muncul dari `/api/trade/quote`
- [ ] Execute swap menghasilkan tx hash dan transaksi terlihat di explorer Mantle Sepolia

---

## 7. Orchestration Canvas (n8n)

**URL**: http://localhost:3000/orchestration

- [ ] n8n canvas ter-embed di halaman
- [ ] Default workflow muncul di canvas
- [ ] Bisa edit node di canvas
- [ ] Intent workflow: masukkan prompt natural language → generate workflow → deploy ke canvas

---

## 8. Marketplace

**URL**: http://localhost:3000/marketplace

- [ ] Listing strategi muncul
- [ ] Klik detail strategi → halaman detail terbuka
- [ ] Cek badge "On-chain Verified" jika ada attestation
- [ ] (Opsional) Publish strategi jika sudah punya 3+ attested runs

---

## 9. Agent Chat

**URL**: http://localhost:3000/agent-chat

- [ ] Chat interface muncul
- [ ] Kirim pesan ke agent (misal: "Apa status FX agent saya?")
- [ ] Agent merespons dengan data relevan (posisi, signal terakhir, dll)
- [ ] Conversation history tersimpan saat refresh

---

## 10. Timeline

**URL**: http://localhost:3000/timeline

- [ ] Semua events dari semua agent runs muncul di timeline
- [ ] Filter by event type berfungsi (decision_input, trade, attestation, dll)
- [ ] Klik event → detail event muncul
- [ ] Tx hash events yang punya on-chain tx bisa diklik → buka Mantle Sepolia explorer

---

## 11. Settings

**URL**: http://localhost:3000/settings (atau via sidebar)

- [ ] Currency manager muncul — bisa tambah/hapus token pair
- [ ] Perubahan tersimpan setelah reload

---

## 12. SelfClaw Verification

Di halaman FX Agent atau Yield Agent:

- [ ] Badge SelfClaw muncul di header/sidebar
- [ ] Klik badge → dialog verifikasi terbuka
- [ ] Proses verifikasi human-backed agent berjalan

---

## 13. Marketplace Publish

**URL**: http://localhost:3000/marketplace/publish

- [ ] Form publish strategi muncul
- [ ] Eligibility check jalan — tampilkan jumlah attested runs
- [ ] Jika belum eligible (< 3 attested runs) → tombol publish disabled dengan pesan jelas
- [ ] Jika eligible → publish berhasil dan strategi muncul di `/marketplace`

---

## 15. On-Chain Verification

Setelah agent run terjadi:

- [ ] Buka https://explorer.sepolia.mantle.xyz
- [ ] Search contract `0xf5328fd1ba47ef168a110d6f984b7dd4c7cd666e` (AttestationRegistry)
- [ ] Cek event `AttestationCommitted` — pastikan `agentId` dan `eventsHash` match dengan yang di dashboard
- [ ] Klik tx hash dari timeline di dashboard → redirect ke explorer dengan tx yang benar

---

## Known Limitations (tidak perlu di-test)

- Mock tokens (mUSDC, mUSDT, mWMNT) tidak punya harga di CoinGecko — normal
