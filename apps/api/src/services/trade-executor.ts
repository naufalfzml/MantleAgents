import {
  MantleDataClient,
  type Chain,
  type EvmChain,
  getAmountOut,
  createEvmTx,
} from '@mantleagents/mantle-data';
import { encodeFunctionData, parseUnits, maxUint256, createPublicClient as viemCreatePublicClient, http as viemHttp } from 'viem';
import {
  ALL_TOKEN_ADDRESSES,
  type TradeResult,
  type FailureCategory,
  getTokenDecimals,
} from '@mantleagents/shared';
import { sendRelayerTransaction } from '../lib/relayer.js';
import { executeUniswapSwap } from './uniswap-swap.js';
import {
  findMantleTokenByAddress,
  isMantleDexConfigured,
  getMantleUsdc,
  getMantleUsdt,
  getMantleDexRouterAddress,
  MANTLE_CHAIN,
  mantleRpcUrl,
} from '../lib/chains.js';

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
  await sendRelayerTransaction({
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
// Mantle / DEX trade path
// ---------------------------------------------------------------------------

type MantelTradeParams = {
  serverWalletAddress: string;
  currency?: string;
  direction?: string;
  amountUsd?: number;
  amountRaw?: string;
  inTokenAddress?: string;
  outTokenAddress?: string;
  slippageBps?: string;
};

function getMantleTokenDecimals(
  tokenAddress: string,
  fallbackSymbol?: string,
): number {
  try {
    const token = findMantleTokenByAddress(tokenAddress);
    if (token) return token.decimals;
  } catch {
    // Fall back to symbol metadata when env-backed lookup is unavailable.
  }

  return fallbackSymbol ? getTokenDecimals(fallbackSymbol) : 18;
}

async function executeMantle(params: MantelTradeParams): Promise<TradeResult> {
  if (!isMantleDexConfigured()) {
    return {
      success: false,
      failureCategory: 'skipped',
      reason: 'Mantle DEX not configured',
    };
  }

  const {
    currency,
    direction,
    amountUsd,
    amountRaw,
    inTokenAddress,
    outTokenAddress,
    slippageBps,
  } = params;

  if (!inTokenAddress || !outTokenAddress) {
    return {
      success: false,
      failureCategory: 'other',
      reason: 'Token addresses required for Mantle trade',
    };
  }

  const amountIn =
    amountRaw != null
      ? BigInt(amountRaw)
      : parseUnits(
          String(amountUsd ?? 0),
          getMantleTokenDecimals(
            inTokenAddress,
            direction === 'buy' ? 'USDT' : currency,
          ),
        );
  const slippageBpsNum = slippageBps != null ? parseInt(slippageBps, 10) : 100;

  console.log(
    `[uniswap-v2] Executing swap on Mantle: ${inTokenAddress} → ${outTokenAddress}, amount=${amountIn}`,
  );

  const result = await executeUniswapSwap({
    tokenIn: inTokenAddress as `0x${string}`,
    tokenOut: outTokenAddress as `0x${string}`,
    amountIn,
    slippageBps: slippageBpsNum,
  });

  console.log(`[uniswap-v2] Success: txHash=${result.txHash}`);

  return {
    success: true,
    txHash: result.txHash,
    amountIn: result.amountIn.toString(),
    amountOut: result.amountOut.toString(),
    rate: Number(result.amountOut) / Math.max(Number(result.amountIn), 1),
  };
}

// ---------------------------------------------------------------------------
// Main trade functions
// ---------------------------------------------------------------------------

/**
 * Execute a trade. Mantle trades route to the self-hosted Uniswap V2 DEX; all
 * other chains use the AVE DEX aggregation path.
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
  const chain = params.chain ?? 'mantle';

  if (chain === 'mantle') {
    try {
      return await executeMantle(params);
    } catch (error) {
      return toFailureResult(error);
    }
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

    const txHash = await sendRelayerTransaction({
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
 * Mantle swaps route to the self-hosted Uniswap V2 DEX; other chains use AVE
 * DEX aggregation.
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
  if ((params.chain ?? 'mantle') === 'mantle') {
    try {
      if (!params.inTokenAddress || !params.outTokenAddress) {
        throw new Error(
          `Token addresses required: inTokenAddress and outTokenAddress must be provided for ${params.from} → ${params.to}`,
        );
      }

      const amountUnits = parseUnits(
        params.amount,
        getMantleTokenDecimals(params.inTokenAddress, params.from),
      );

      return await executeMantle({
        serverWalletAddress: params.serverWalletAddress,
        currency: params.from,
        direction: 'buy',
        amountRaw: amountUnits.toString(),
        inTokenAddress: params.inTokenAddress,
        outTokenAddress: params.outTokenAddress,
        slippageBps:
          params.slippagePct != null
            ? String(Math.round(params.slippagePct * 100))
            : undefined,
      });
    } catch (error) {
      return toFailureResult(error);
    }
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

    const txHash = await sendRelayerTransaction({
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

// ---------------------------------------------------------------------------
// Uniswap V2 addLiquidity / removeLiquidity
// ---------------------------------------------------------------------------

const UNISWAP_V2_ROUTER_ABI = [
  {
    name: 'addLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'amountADesired', type: 'uint256' },
      { name: 'amountBDesired', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
  {
    name: 'removeLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'amountAMin', type: 'uint256' },
      { name: 'amountBMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountA', type: 'uint256' },
      { name: 'amountB', type: 'uint256' },
    ],
  },
] as const;

const PAIR_ABI_FOR_EXECUTOR = [
  {
    name: 'token0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'token1',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

export interface YieldDepositResult {
  success: boolean;
  txHash?: string;
  vaultAddress?: string;
  lpShares?: bigint;
  error?: string;
}

export interface YieldWithdrawResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Add liquidity to a Uniswap V2 pair on Mantle DEX.
 * Single-sided zap-in: swaps half the USDC/USDT input to the paired token first.
 */
export async function executeYieldDeposit(params: {
  serverWalletId: string;
  serverWalletAddress: string;
  vaultAddress: `0x${string}`;
  amountUsd: number;
}): Promise<YieldDepositResult> {
  const { serverWalletAddress, vaultAddress, amountUsd } = params;

  try {
    const router = getMantleDexRouterAddress();
    const client = viemCreatePublicClient({ chain: MANTLE_CHAIN, transport: viemHttp(mantleRpcUrl()) });

    // Read pair tokens
    const [token0, token1] = await Promise.all([
      client.readContract({ address: vaultAddress, abi: PAIR_ABI_FOR_EXECUTOR, functionName: 'token0' }),
      client.readContract({ address: vaultAddress, abi: PAIR_ABI_FOR_EXECUTOR, functionName: 'token1' }),
    ]);

    const usdc = getMantleUsdc();
    const usdt = getMantleUsdt();

    // Determine which token is our entry stablecoin and which is the other token
    const isUsdc = (addr: string) => addr.toLowerCase() === usdc.address.toLowerCase();
    const isUsdt = (addr: string) => addr.toLowerCase() === usdt.address.toLowerCase();

    const isToken0Stable = isUsdc(token0) || isUsdt(token0);
    const stableAddress = (isToken0Stable ? token0 : token1) as `0x${string}`;
    const otherAddress = (isToken0Stable ? token1 : token0) as `0x${string}`;

    const stableDecimals = 6; // Both USDC and USDT are 6 decimals on Mantle
    const otherToken = findMantleTokenByAddress(otherAddress);
    const otherDecimals = otherToken?.decimals ?? 18;

    // Half the amount in stable for entry side, half to swap for the other token
    const halfUsd = amountUsd / 2;
    const stableAmountIn = parseUnits(halfUsd.toFixed(stableDecimals), stableDecimals);

    // Swap half stable → other token via our DEX
    console.log(`[yield-deposit] Swapping half ($${halfUsd.toFixed(2)}) ${stableAddress} → ${otherAddress}`);
    const swapResult = await executeUniswapSwap({
      tokenIn: stableAddress,
      tokenOut: otherAddress,
      amountIn: stableAmountIn,
      slippageBps: 200, // 2% slippage for zap-in
    });

    const otherAmountIn = swapResult.amountOut;
    const stableAmountForLiquidity = stableAmountIn;

    console.log(`[yield-deposit] Got ${otherAmountIn} of other token from swap`);

    // Approve both tokens for router
    await Promise.all([
      ensureErc20Allowance(stableAddress, serverWalletAddress, router, stableAmountForLiquidity),
      ensureErc20Allowance(otherAddress, serverWalletAddress, router, otherAmountIn),
    ]);

    // Read LP balance before addLiquidity to compute shares minted by diff
    const lpBefore = await client.readContract({
      address: vaultAddress,
      abi: PAIR_ABI_FOR_EXECUTOR,
      functionName: 'balanceOf',
      args: [serverWalletAddress as `0x${string}`],
    });

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20 min deadline

    // Determine token order for addLiquidity (must match token0/token1)
    const tokenA = isToken0Stable ? stableAddress : otherAddress;
    const tokenB = isToken0Stable ? otherAddress : stableAddress;
    const amountADesired = isToken0Stable ? stableAmountForLiquidity : otherAmountIn;
    const amountBDesired = isToken0Stable ? otherAmountIn : stableAmountForLiquidity;

    console.log(`[yield-deposit] addLiquidity: tokenA=${tokenA} amtA=${amountADesired}, tokenB=${tokenB} amtB=${amountBDesired}`);

    const addLiquidityData = encodeFunctionData({
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'addLiquidity',
      args: [tokenA, tokenB, amountADesired, amountBDesired, 0n, 0n, serverWalletAddress as `0x${string}`, deadline],
    });

    const txHash = await sendRelayerTransaction({ to: router, data: addLiquidityData });
    console.log(`[yield-deposit] addLiquidity tx: ${txHash}`);

    // Compute LP shares minted
    const lpAfter = await client.readContract({
      address: vaultAddress,
      abi: PAIR_ABI_FOR_EXECUTOR,
      functionName: 'balanceOf',
      args: [serverWalletAddress as `0x${string}`],
    });
    const lpShares = lpAfter - lpBefore;
    console.log(`[yield-deposit] LP shares minted: ${lpShares}`);

    return { success: true, txHash, vaultAddress, lpShares };
  } catch (err) {
    console.error('[yield-deposit] Failed:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Remove liquidity from a Uniswap V2 pair on Mantle DEX.
 */
export async function executeYieldWithdraw(params: {
  serverWalletId: string;
  serverWalletAddress: string;
  vaultAddress: `0x${string}`;
  lpShares?: bigint;
}): Promise<YieldWithdrawResult> {
  const { serverWalletAddress, vaultAddress, lpShares } = params;

  try {
    const router = getMantleDexRouterAddress();
    const client = viemCreatePublicClient({ chain: MANTLE_CHAIN, transport: viemHttp(mantleRpcUrl()) });

    // If lpShares not provided, use full balance
    let shares = lpShares;
    if (!shares || shares === 0n) {
      shares = await client.readContract({
        address: vaultAddress,
        abi: PAIR_ABI_FOR_EXECUTOR,
        functionName: 'balanceOf',
        args: [serverWalletAddress as `0x${string}`],
      });
    }

    if (!shares || shares === 0n) {
      return { success: false, error: 'No LP shares to withdraw' };
    }

    const [token0, token1] = await Promise.all([
      client.readContract({ address: vaultAddress, abi: PAIR_ABI_FOR_EXECUTOR, functionName: 'token0' }),
      client.readContract({ address: vaultAddress, abi: PAIR_ABI_FOR_EXECUTOR, functionName: 'token1' }),
    ]);

    // LP token in Uniswap V2 = pair contract itself — approve router to spend it
    await ensureErc20Allowance(vaultAddress, serverWalletAddress, router, shares);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);

    console.log(`[yield-withdraw] removeLiquidity: pair=${vaultAddress}, shares=${shares}`);

    const removeLiquidityData = encodeFunctionData({
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: 'removeLiquidity',
      args: [token0, token1, shares, 0n, 0n, serverWalletAddress as `0x${string}`, deadline],
    });

    const txHash = await sendRelayerTransaction({ to: router, data: removeLiquidityData });
    console.log(`[yield-withdraw] removeLiquidity tx: ${txHash}`);

    return { success: true, txHash };
  } catch (err) {
    console.error('[yield-withdraw] Failed:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
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

  const txHash = await sendRelayerTransaction({
    to: tokenAddress as `0x${string}`,
    data,
  });

  return { txHash };
}
