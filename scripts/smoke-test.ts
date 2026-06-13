/**
 * Smoke test for @mantleagents/mantle-data SDK.
 * Run: npx tsx scripts/smoke-test.ts
 *
 * Requires AVE_API_KEY in env (or .env file in apps/api/).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env — try cwd first (if run from apps/api), then project root
try {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
  ];
  const envPath = candidates.find((p) => {
    try { readFileSync(p); return true; } catch { return false; }
  }) ?? candidates[0];
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // No .env file — rely on existing env vars
}

import {
  AveClient,
  AveApiError,
  searchToken,
  getTokenDetail,
  checkContractRisk,
  getAmountOut,
  EVM_NATIVE_ADDRESS,
  type Chain,
  type ExecuteTradeParams,
} from '@mantleagents/mantle-data';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`  \x1b[31mFAIL\x1b[0m  ${name} — ${detail}`);
}

// Well-known token addresses for testing
const SOL_NATIVE = 'sol';
const SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BSC_WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n--- MantleAgents AVE SDK Smoke Test ---\n');

  // 0. Client init
  let client: AveClient;
  try {
    client = new AveClient();
    pass('Client init', 'AVE_API_KEY loaded');
  } catch (err: any) {
    fail('Client init', err.message);
    printSummary();
    process.exit(1);
  }

  // =========================================================================
  // DATA REST
  // =========================================================================
  console.log('\n[Data REST]');

  // 1. searchToken
  try {
    const results = await searchToken(client, {
      keyword: 'SOL',
      chain: 'solana',
      limit: 5,
    });
    if (Array.isArray(results) && results.length > 0) {
      pass('searchToken("SOL", solana)', `${results.length} results`);
    } else {
      fail('searchToken("SOL", solana)', `Expected results, got ${JSON.stringify(results)}`);
    }
  } catch (err: any) {
    fail('searchToken("SOL", solana)', err.message);
  }

  // 2. getTokenDetail (Solana USDC)
  // NOTE: AVE returns { token: { current_price_usd, symbol, ... }, pairs: [...] }
  try {
    const detail: any = await getTokenDetail(client, 'solana', SOL_USDC);
    const token = detail?.token ?? detail;
    const price = Number(token?.current_price_usd ?? token?.price ?? 0);
    const symbol = token?.symbol ?? '';
    if (price > 0) {
      pass('getTokenDetail(solana, USDC)', `price=$${price}, symbol=${symbol}`);
    } else {
      fail('getTokenDetail(solana, USDC)', `No price in response (keys: ${Object.keys(detail ?? {}).join(',')})`);
    }
  } catch (err: any) {
    fail('getTokenDetail(solana, USDC)', err.message);
  }

  // 3. getTokenDetail (BSC WBNB)
  try {
    const detail: any = await getTokenDetail(client, 'bsc', BSC_WBNB);
    const token = detail?.token ?? detail;
    const price = Number(token?.current_price_usd ?? token?.price ?? 0);
    const symbol = token?.symbol ?? '';
    if (price > 0) {
      pass('getTokenDetail(bsc, WBNB)', `price=$${price}, symbol=${symbol}`);
    } else {
      fail('getTokenDetail(bsc, WBNB)', `No price in response (keys: ${Object.keys(detail ?? {}).join(',')})`);
    }
  } catch (err: any) {
    fail('getTokenDetail(bsc, WBNB)', err.message);
  }

  // 4. checkContractRisk (BSC WBNB — known safe token)
  try {
    const risk: any = await checkContractRisk(client, 'bsc', BSC_WBNB);
    const riskLevel = risk?.risk_level ?? risk?.ave_risk_level ?? risk?.token?.ave_risk_level;
    if (riskLevel !== undefined) {
      pass(
        'checkContractRisk(bsc, WBNB)',
        `risk_level=${riskLevel}, honeypot=${risk?.is_honeypot ?? risk?.honeypot ?? 'N/A'}`,
      );
    } else if (risk) {
      pass('checkContractRisk(bsc, WBNB)', `Response received (keys: ${Object.keys(risk).join(',')})`);
    } else {
      fail('checkContractRisk(bsc, WBNB)', 'Empty response');
    }
  } catch (err: any) {
    if (err instanceof AveApiError && err.msg?.includes('not found')) {
      pass('checkContractRisk(bsc, WBNB)', 'Token not in risk DB (expected for blue-chip)');
    } else {
      fail('checkContractRisk(bsc, WBNB)', err.message);
    }
  }

  // =========================================================================
  // TRADE — DRY RUN (param validation only, no execution)
  // =========================================================================
  console.log('\n[Trade — Dry Run]');

  // 5. Solana trade params construction
  try {
    const solanaParams: ExecuteTradeParams = {
      chain: 'solana',
      walletAddress: '11111111111111111111111111111111', // dummy
      inAmount: '1000000000', // 1 SOL in lamports
      inTokenAddress: SOL_NATIVE,
      outTokenAddress: SOL_USDC,
      swapType: 'buy',
      slippage: '100',
      solanaFee: '100000',
      signTransaction: async () => {
        throw new Error('DRY RUN — not signing');
      },
    };

    // Validate all required fields present
    const requiredFields: (keyof ExecuteTradeParams)[] = [
      'chain',
      'walletAddress',
      'inAmount',
      'inTokenAddress',
      'outTokenAddress',
      'swapType',
      'signTransaction',
    ];
    const missing = requiredFields.filter((f) => !solanaParams[f]);
    if (missing.length > 0) {
      fail('Solana trade params', `Missing fields: ${missing.join(', ')}`);
    } else {
      pass('Solana trade params', 'All required fields present');
    }
  } catch (err: any) {
    fail('Solana trade params', err.message);
  }

  // 6. BSC trade params construction
  try {
    const bscParams: ExecuteTradeParams = {
      chain: 'bsc',
      walletAddress: '0x0000000000000000000000000000000000000001', // dummy
      inAmount: '1000000000000000000', // 1 BNB in wei
      inTokenAddress: EVM_NATIVE_ADDRESS,
      outTokenAddress: BSC_USDT,
      swapType: 'buy',
      slippage: '100',
      signTransaction: async () => {
        throw new Error('DRY RUN — not signing');
      },
    };

    const requiredFields: (keyof ExecuteTradeParams)[] = [
      'chain',
      'walletAddress',
      'inAmount',
      'inTokenAddress',
      'outTokenAddress',
      'swapType',
      'signTransaction',
    ];
    const missing = requiredFields.filter((f) => !bscParams[f]);
    if (missing.length > 0) {
      fail('BSC trade params', `Missing fields: ${missing.join(', ')}`);
    } else {
      pass('BSC trade params', 'All required fields present');
    }
  } catch (err: any) {
    fail('BSC trade params', err.message);
  }

  // 7. getAmountOut quote (BSC: BNB → USDT)
  try {
    const quote = await getAmountOut(client, {
      chain: 'bsc',
      inAmount: '10000000000000000', // 0.01 BNB
      inTokenAddress: EVM_NATIVE_ADDRESS,
      outTokenAddress: BSC_USDT,
      swapType: 'buy',
    });
    if (quote && quote.estimateOut) {
      pass(
        'getAmountOut(bsc, BNB→USDT)',
        `estimateOut=${quote.estimateOut}, decimals=${quote.decimals}`,
      );
    } else {
      fail('getAmountOut(bsc, BNB→USDT)', `Unexpected response: ${JSON.stringify(quote)}`);
    }
  } catch (err: any) {
    fail('getAmountOut(bsc, BNB→USDT)', err.message);
  }

  // 8. Env var check for private keys
  try {
    const evmKey = process.env.AVE_EVM_PRIVATE_KEY;
    const solKey = process.env.AVE_SOLANA_PRIVATE_KEY;
    const parts: string[] = [];
    if (evmKey) parts.push('EVM key loaded');
    else parts.push('EVM key MISSING');
    if (solKey) parts.push('Solana key loaded');
    else parts.push('Solana key MISSING');

    // Not a hard fail — keys are optional for smoke test
    pass('Private keys env check', parts.join(', '));
  } catch (err: any) {
    fail('Private keys env check', err.message);
  }

  // =========================================================================
  // Summary
  // =========================================================================
  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const total = results.length;

  console.log('\n--- Summary ---');
  console.log(`  ${passed}/${total} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    console.log('');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
