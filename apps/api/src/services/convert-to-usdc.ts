// TODO: implement multi-chain logic — was using findRoute, applySlippage from @mantleagents/mantle-data,
// chain client, DEX route finding, and Uniswap fallback swaps.

export interface ConvertSwapped {
  symbol: string;
  amount: string;
  txHash: string;
}

export interface ConvertSkipped {
  symbol: string;
  reason: string;
}

export interface ConvertToUsdcResult {
  swapped: ConvertSwapped[];
  skipped: ConvertSkipped[];
}

export async function convertWalletToUsdc(_params: {
  serverWalletId: string;
  serverWalletAddress: string;
}): Promise<ConvertToUsdcResult> {
  // Stubbed — needs multi-chain DEX routing implementation
  console.warn('[convert-to-usdc] stubbed — multi-chain routing not yet implemented');
  return { swapped: [], skipped: [] };
}
