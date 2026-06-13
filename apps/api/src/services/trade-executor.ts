import {
  MantleDataClient,
  type Chain,
  type EvmChain,
  getAmountOut,
  createEvmTx,
} from '@mantleagents/mantle-data';
import { executeRealClawSwap, isRealClawConfigured } from './realclaw-executor.js';
import { encodeFunctionData, parseUnits, maxUint256 } from 'viem';
import {
  ALL_TOKEN_ADDRESSES,
  type TradeResult,
  type FailureCategory,
  getTokenDecimals,
} from '@mantleagents/shared';
import { sendTransactionFromServerWallet } from '../lib/thirdweb-wallet.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_SLIPPAGE_BPS = '100'; // 1%
const DEFAULT_SOLANA_FEE = '100000'; // 0.0001 SOL priority fee

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Ensure the DEX router has sufficient ERC20 allowance to spend `tokenAddress`
 * from `walletAddress`. Sends an approve(spender, maxUint256) tx if needed.
 */
async function ensureErc20Allowance(
  tokenAddress: string,
  walletAddress: string,
  spender: string,
  requiredAmount: bigint,
): Promise<void> {
  // Check current allowance via eth_call
  const allowanceData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [walletAddress as `0x${string}`, spender as `0x${string}`],
  });

  try {
    const { createPublicClient, http } = await import('viem');
    const { MANTLE_CHAIN, mantleRpcUrl } = await import('../lib/chains.js');
    const publicClient = createPublicClient({ chain: MANTLE_CHAIN, transport: http(mantleRpcUrl()) });
    const result = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [walletAddress as `0x${string}`, spender as `0x${string}`],
    });
    if ((result as bigint) >= requiredAmount) {
      return; // already sufficient
    }
  } catch {
    // If allowance check fails, proceed with approval anyway
  }

  console.log(`[trade] Approving ${spender} to spend token ${tokenAddress}`);
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender as `0x${string}`, maxUint256],
  });
  await sendTransactionFromServerWallet(walletAddress, {
    to: tokenAddress,
    data: approveData,
  });
  console.log(`[trade] Approval tx submitted`);
}

let _aveClient: MantleDataClient | undefined;

function getMantleDataClient(): MantleDataClient {
  if (!_aveClient) {
    _aveClient = new MantleDataClient();
  }
  return _aveClient;
}

function mapFailureCategory(statusOrReason: string, maybeReason?: string): FailureCategory {
  const combined = `${statusOrReason} ${maybeReason ?? ''}`.toLowerCase();

  if (
    combined.includes('slippage') ||
    combined.includes('price impact') ||
    combined.includes('minimum received')
  ) {
    return 'slippage_exceeded';
  }

  if (
    combined.includes('risk') ||
    combined.includes('honeypot') ||
    combined.includes('unsafe') ||
    combined.includes('simulation') ||
    combined.includes('tax')
  ) {
    return 'risk_flagged';
  }

  if (
    combined.includes('insufficient') ||
    combined.includes('balance') ||
    combined.includes('allowance') ||
    combined.includes('funds')
  ) {
    return 'insufficient_funds';
  }

  return 'other';
}

function toFailureResult(error: unknown): Extract<TradeResult, { success: false }> {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    failureCategory: mapFailureCategory(reason),
    reason,
  };
}

// ---------------------------------------------------------------------------
// Mantle / RealClaw trade path
// ---------------------------------------------------------------------------

type MantelTradeParams = {
  serverWalletAddress: string;
  currency?: string;
  direction?: string;
  amountUsd?: number;
  inTokenAddress?: string;
  outTokenAddress?: string;
  slippageBps?: string;
};

async function executeMantle(params: MantelTradeParams): Promise<TradeResult> {
  if (!isRealClawConfigured()) {
    return {
      success: false,
      failureCategory: 'skipped',
      reason: 'RealClaw not configured',
    };
  }

  const { serverWalletAddress, inTokenAddress, outTokenAddress, amountUsd, slippageBps } = params;

  if (!inTokenAddress || !outTokenAddress) {
    return {
      success: false,
      failureCategory: 'other',
      reason: 'Token addresses required for Mantle trade',
    };
  }

  const inAmountRaw = BigInt(Math.floor((amountUsd ?? 0) * 1e18)).toString();
  const slippageBpsNum = slippageBps != null ? parseInt(slippageBps, 10) : 100;

  console.log(
    `[realclaw] Executing swap on Mantle: ${inTokenAddress} → ${outTokenAddress}, amount=${inAmountRaw}`,
  );

  const result = await executeRealClawSwap({
    walletAddress: serverWalletAddress,
    tokenIn: inTokenAddress as `0x${string}`,
    tokenOut: outTokenAddress as `0x${string}`,
    amountIn: inAmountRaw,
    slippageBps: slippageBpsNum,
  });

  if (result.status === 'success') {
    console.log(`[realclaw] Success: txHash=${result.txHash}`);
    return {
      success: true,
      txHash: result.txHash,
      amountIn: inAmountRaw,
      amountOut: result.amountOut,
      rate: 0,
    };
  }

  if (result.status === 'pending_confirmation') {
    return {
      success: false,
      failureCategory: 'pending_confirmation',
      reason: `pending_confirmation: ${result.reason}`,
    };
  }

  return {
    success: false,
    failureCategory: mapFailureCategory(result.reason),
    reason: result.reason,
  };
}

// ---------------------------------------------------------------------------
// Main trade functions
// ---------------------------------------------------------------------------

/**
 * Execute a trade. Mantle trades route to RealClaw when configured; all other
 * chains use the AVE DEX aggregation path.
 */
export async function executeTrade(params: {
  serverWalletId: string;
  serverWalletAddress: string;
  currency: string;
  direction: 'buy' | 'sell';
  amountUsd: number;
  chain?: Chain;
  inTokenAddress?: string;
  outTokenAddress?: string;
  slippageBps?: string;
}): Promise<TradeResult> {
  const chain = params.chain ?? 'bsc';

  if (chain === 'mantle') {
    return executeMantle(params);
  }

  try {
    const {
      serverWalletAddress,
      currency,
      direction,
      amountUsd,
      inTokenAddress,
      outTokenAddress,
      slippageBps = DEFAULT_SLIPPAGE_BPS,
    } = params;

    if (amountUsd == null || typeof amountUsd !== 'number' || amountUsd <= 0) {
      throw new Error(
        `Invalid trade amount for ${currency}: amountUsd must be a positive number (got ${String(amountUsd)})`,
      );
    }

    if (!inTokenAddress || !outTokenAddress) {
      throw new Error(
        `Token addresses required: inTokenAddress and outTokenAddress must be provided for ${currency} ${direction}`,
      );
    }

    const client = getMantleDataClient();
    const swapType = direction === 'buy' ? 'buy' : 'sell';
    const inAmountRaw = BigInt(Math.floor(amountUsd * 1e18)).toString();

    console.log(
      `[trade] Executing ${direction} ${currency} on ${chain}: ` +
        `$${amountUsd}, in=${inTokenAddress}, out=${outTokenAddress}`,
    );

    const quote = await getAmountOut(client, {
      chain,
      inAmount: inAmountRaw,
      inTokenAddress,
      outTokenAddress,
      swapType,
    });

    console.log(
      `[trade] Quote: estimateOut=${quote.estimateOut}, decimals=${quote.decimals}`,
    );

    const evmChain = chain as EvmChain;
    const created = await createEvmTx(client, {
      chain: evmChain,
      creatorAddress: serverWalletAddress,
      inAmount: inAmountRaw,
      inTokenAddress,
      outTokenAddress,
      swapType,
      slippage: slippageBps,
    });

    const { data, to, value } = created.txContent;
    console.log(`[trade] AVE tx built: to=${to}, requestTxId=${created.requestTxId}`);

    await ensureErc20Allowance(inTokenAddress, serverWalletAddress, to, BigInt(inAmountRaw));

    const txHash = await sendTransactionFromServerWallet(serverWalletAddress, {
      to,
      data,
      value: BigInt(value || '0'),
    });

    const estimateOutNum = Number(quote.estimateOut) || 0;
    const inAmountNum = Number(inAmountRaw) || 0;
    const rate = inAmountNum > 0 ? estimateOutNum / inAmountNum : 0;

    console.log(`[trade] Success: txHash=${txHash}`);

    return {
      success: true,
      txHash,
      amountIn: inAmountRaw,
      amountOut: quote.estimateOut,
      rate,
    };
  } catch (error) {
    return toFailureResult(error);
  }
}

/**
 * Execute a manual swap for an arbitrary token pair.
 * Mantle swaps route to RealClaw; other chains use AVE DEX aggregation.
 */
export async function executeSwap(params: {
  serverWalletId: string;
  serverWalletAddress: string;
  from: string;
  to: string;
  amount: string;
  slippagePct?: number;
  chain?: Chain;
  inTokenAddress?: string;
  outTokenAddress?: string;
}): Promise<TradeResult> {
  if ((params.chain ?? 'bsc') === 'mantle') {
    return executeMantle({
      serverWalletAddress: params.serverWalletAddress,
      currency: params.from,
      direction: 'buy',
      inTokenAddress: params.inTokenAddress,
      outTokenAddress: params.outTokenAddress,
      slippageBps: params.slippagePct != null ? String(Math.round(params.slippagePct * 100)) : undefined,
    });
  }

  try {
    const {
      serverWalletAddress,
      from,
      to,
      amount,
      slippagePct = 1,
      chain = 'bsc',
      inTokenAddress,
      outTokenAddress,
    } = params;

    if (!inTokenAddress || !outTokenAddress) {
      throw new Error(
        `Token addresses required: inTokenAddress and outTokenAddress must be provided for ${from} → ${to}`,
      );
    }

    const client = getMantleDataClient();
    const evmChain = chain as EvmChain;
    const slippageBps = String(Math.round(slippagePct * 100));

    console.log(`[trade] Swap ${amount} ${from} → ${to} on ${chain}`);

    const quote = await getAmountOut(client, {
      chain,
      inAmount: amount,
      inTokenAddress,
      outTokenAddress,
      swapType: 'buy',
    });

    const created = await createEvmTx(client, {
      chain: evmChain,
      creatorAddress: serverWalletAddress,
      inAmount: amount,
      inTokenAddress,
      outTokenAddress,
      swapType: 'buy',
      slippage: slippageBps,
    });

    await ensureErc20Allowance(inTokenAddress, serverWalletAddress, created.txContent.to, BigInt(amount));

    const txHash = await sendTransactionFromServerWallet(serverWalletAddress, {
      to: created.txContent.to,
      data: created.txContent.data,
      value: BigInt(created.txContent.value || '0'),
    });

    const estimateOutNum = Number(quote.estimateOut) || 0;
    const inAmountNum = Number(amount) || 0;
    const rate = inAmountNum > 0 ? estimateOutNum / inAmountNum : 0;

    return {
      success: true,
      txHash,
      amountIn: amount,
      amountOut: quote.estimateOut,
      rate,
    };
  } catch (error) {
    return toFailureResult(error);
  }
}

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Send ERC20 tokens from the agent's server wallet to a recipient.
 */
export async function sendTokens(params: {
  serverWalletId: string;
  serverWalletAddress: string;
  token: string;
  amount: string;
  recipient: string;
  chain?: Chain;
}): Promise<{ txHash: string }> {
  const { serverWalletAddress, token, amount, recipient } = params;

  const tokenAddress = ALL_TOKEN_ADDRESSES[token];
  if (!tokenAddress) {
    throw new Error(`Unknown token: ${token}`);
  }

  const decimals = getTokenDecimals(token);
  const amountUnits = parseUnits(amount, decimals);

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [recipient as `0x${string}`, amountUnits],
  });

  const txHash = await sendTransactionFromServerWallet(serverWalletAddress, {
    to: tokenAddress as `0x${string}`,
    data,
  });

  return { txHash };
}
