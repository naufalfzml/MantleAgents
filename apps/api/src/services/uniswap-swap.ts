// TODO: implement multi-chain logic — was using Uniswap V3 QuoterV2/SwapRouter02 ABIs
// and addresses from @mantleagents/mantle-data, plus chain client and thirdweb wallet.

import type { Address, PublicClient } from 'viem';

export interface UniswapQuoteResult {
  amountOut: bigint;
  fee: number;
}

/**
 * Get a Uniswap V3 quote for tokenIn -> tokenOut.
 * TODO: implement multi-chain logic
 */
export async function getUniswapQuote(_params: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  publicClient: PublicClient;
}): Promise<UniswapQuoteResult | null> {
  return null;
}

export interface UniswapSwapResult {
  txHash: string;
  amountIn: bigint;
  amountOut: bigint;
}

/**
 * Execute a Uniswap V3 swap.
 * TODO: implement multi-chain logic
 */
export async function executeUniswapSwap(_params: {
  serverWalletId: string;
  serverWalletAddress: string;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOutMin: bigint;
  fee: number;
}): Promise<UniswapSwapResult> {
  throw new Error('executeUniswapSwap not yet implemented for multi-chain');
}
