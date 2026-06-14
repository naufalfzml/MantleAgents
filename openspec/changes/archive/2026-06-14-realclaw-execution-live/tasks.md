## 1. API Schema Research (blocking — do first)

- [ ] 1.1 Access `openclaw.mantle.xyz` and/or the `byreal-agent-skills` repo; confirm the exact skill name for token swaps (e.g. `dex-swap`, `swap`, `execute-swap`)
- [ ] 1.2 Confirm auth scheme: Bearer token (`Authorization: Bearer <REALCLAW_API_KEY>`), or agent identity signature (ERC-8004), or other
- [ ] 1.3 Confirm request payload field names: `tokenIn`/`tokenOut`/`amountIn`/`slippageBps` or their equivalents
- [ ] 1.4 Confirm all possible response shapes: success (with `txHash`, `amountOut`), `pending_confirmation`, failed (4xx), error (5xx)
- [ ] 1.5 Confirm whether Privy server-wallet flow requires any out-of-band confirmation or is fully autonomous
- [x] 1.6 Write `docs/REALCLAW_API.md` documenting: base URL, auth header, skill name, request payload example, all response examples

## 2. Config Validation

- [x] 2.1 Update `isRealClawConfigured()` in `realclaw-executor.ts` to validate both `REALCLAW_API_KEY` and `REALCLAW_API_BASE`, log a structured warning listing missing vars, return `false` if either is absent
- [x] 2.2 Add a startup call to `isRealClawConfigured()` in the API server boot sequence (e.g. `apps/api/src/index.ts` or `agent-cron.ts`) that logs whether RealClaw is active or disabled

## 3. Core Executor Implementation

- [x] 3.1 Update `callRealClawSkill()` in `realclaw-executor.ts`: set correct skill endpoint path, auth header, and request body shape per `docs/REALCLAW_API.md`
- [x] 3.2 Implement `pending_confirmation` polling loop: poll every 2s up to `REALCLAW_CONFIRM_TIMEOUT_MS` (default 20 000), return `{ status: 'pending_confirmation', reason: 'timeout' }` on expiry
- [x] 3.3 Implement 4xx handling: return `{ status: 'failed', reason }` immediately, no retry
- [x] 3.4 Implement 5xx / network error retry: up to 3 attempts with backoff 1s → 2s → 4s; return `{ status: 'error', reason }` after exhaustion
- [x] 3.5 Update `executeRealClawSwap()` return type to the discriminated union `{ status: 'success' | 'failed' | 'pending_confirmation' | 'error', txHash?, amountOut?, reason? }`
- [x] 3.6 Remove all `TODO` and scaffold comments; update the file-level docstring to reflect the live implementation

## 4. Trade Executor Wiring

- [x] 4.1 In `trade-executor.ts`, locate the Mantle chain branch in `executeTrade()` and `executeSwap()`
- [x] 4.2 Wire the Mantle branch to call `executeRealClawSwap()` when `isRealClawConfigured()` is true
- [x] 4.3 Map `status: 'success'` → emit `trade` event with `tx_hash` populated
- [x] 4.4 Map `status: 'failed'` or `status: 'error'` → emit `trade_failed` event with `reason`
- [x] 4.5 Map `status: 'pending_confirmation'` → emit `trade_pending` event with `reason`
- [x] 4.6 When `isRealClawConfigured()` is false → emit `trade_skipped` event with `reason: 'RealClaw not configured'`; return without throwing

## 5. Unit Tests

- [x] 5.1 Create `apps/api/src/services/realclaw-executor.test.ts`
- [x] 5.2 Test: mock success response → `executeRealClawSwap` returns `{ status: 'success', txHash, amountOut }`
- [x] 5.3 Test: mock 4xx response → returns `{ status: 'failed', reason }` with 0 retries
- [x] 5.4 Test: mock 5xx × 3 → returns `{ status: 'error', reason }` after 3 retries
- [x] 5.5 Test: mock `pending_confirmation` then success on next poll → returns `{ status: 'success', txHash, amountOut }`
- [x] 5.6 Test: mock `pending_confirmation` until timeout → returns `{ status: 'pending_confirmation', reason: 'timeout' }`
- [x] 5.7 Extend `trade-executor.test.ts`: Mantle chain + configured → `executeRealClawSwap` is called (spy), not AVE path
- [x] 5.8 Extend `trade-executor.test.ts`: Mantle chain + not configured → `trade_skipped` event emitted, no throw
- [x] 5.9 Run `cd apps/api && pnpm vitest run src/services/realclaw-executor.test.ts` — all tests green
- [x] 5.10 Run `cd apps/api && pnpm vitest run src/services/trade-executor.test.ts` — all tests green

## 6. End-to-End Manual Test (Mantle Sepolia)

- [ ] 6.1 Set `REALCLAW_API_KEY` and `REALCLAW_API_BASE` in `apps/api/.env` with testnet credentials
- [ ] 6.2 Ensure agent wallet has testnet mUSDC and mWMNT balance on Mantle Sepolia
- [ ] 6.3 Run `pnpm --filter @mantleagents/api dev`; confirm startup log shows "RealClaw execution active"
- [ ] 6.4 Trigger one agent run (manual endpoint or wait for 60s cron tick) with a signal that produces a small buy (mUSDC → mWMNT)
- [ ] 6.5 Verify `tx_hash` appears in `agent_timeline` row with `event_type = 'trade'`
- [ ] 6.6 Verify tx hash resolves on Mantle Sepolia explorer showing the correct wallet address
- [ ] 6.7 Confirm no uncaught exceptions in API logs

## 7. Cleanup

- [x] 7.1 Run `pnpm type-check` — exit 0
- [x] 7.2 Update `CLAUDE.md` §"Mantle Execution": remove "scaffolded, pending confirmation" note; replace with one-line summary of the live implementation and confirmed skill/endpoint
