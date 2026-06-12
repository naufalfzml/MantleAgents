import type { FailureCategory } from './agent.js';

export type N8nSupportedChain =
  | 'bsc'
  | 'eth'
  | 'solana'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'avax'
  | 'polygon'
  | 'ton';

export interface N8nKlineCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface N8nContractRiskSummary {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number;
  honeypot: boolean;
  buyTax: number;
  sellTax: number;
  owner?: string;
  ownershipRenounced: boolean;
  canMint: boolean;
  canBurn: boolean;
  holderConcentration: number;
  dexLiquidity: number;
}

export interface N8nMarketDataRequest {
  walletAddress: string;
  chain: N8nSupportedChain;
  tokenAddress: string;
  klineInterval?: 1 | 5 | 15 | 30 | 60 | 120 | 240 | 1440 | 4320 | 10080;
  klineLimit?: number;
}

export interface N8nMarketDataResponse {
  walletAddress: string;
  chain: N8nSupportedChain;
  tokenAddress: string;
  marketData: {
    symbol: string;
    name: string;
    priceUsd: number;
    priceChange24hPct: number;
    marketCap: number;
    volume24h: number;
    holderCount: number;
  };
  kline: N8nKlineCandle[];
  riskSummary: N8nContractRiskSummary | null;
}

export interface N8nNewsArticle {
  title: string;
  url: string;
  excerpt: string;
  source?: string;
}

export interface N8nPositionSnapshot {
  tokenSymbol: string;
  balance: number;
}

export interface N8nWalletBalanceSnapshot {
  symbol: string;
  formatted: string;
  valueUsd: number;
}

export interface N8nSignalAnalysisRequest {
  walletAddress: string;
  news: N8nNewsArticle[];
  currentPositions: N8nPositionSnapshot[];
  portfolioValueUsd: number;
  allowedCurrencies: string[];
  walletBalances?: N8nWalletBalanceSnapshot[];
  customPrompt?: string | null;
}

export interface N8nSignalAnalysisResponse {
  walletAddress: string;
  signals: Array<{
    currency: string;
    direction: 'buy' | 'sell' | 'hold';
    confidence: number;
    allocationPct: number;
    reasoning: string;
    timeHorizon: 'short' | 'medium' | 'long';
  }>;
  marketSummary: string;
  sourcesUsed: number;
}

export interface N8nGuardrailConfig {
  maxTradeSizePct: number;
  maxAllocationPct: number;
  stopLossPct: number;
  dailyTradeLimit: number;
  allowedCurrencies: string[];
  blockedCurrencies: string[];
  availableBuyingPowerUsd?: number;
}

export interface N8nGuardrailPosition {
  tokenSymbol: string;
  balance: number;
  avgEntryRate: number;
}

export interface N8nGuardrailCheckRequest {
  walletAddress: string;
  signal: {
    currency: string;
    direction: 'buy' | 'sell';
    confidence: number;
    reasoning: string;
  };
  config: N8nGuardrailConfig;
  positions: N8nGuardrailPosition[];
  portfolioValueUsd: number;
  tradesToday: number;
  tradeAmountUsd: number;
  positionPrices?: Record<string, number>;
  availableBuyingPowerUsd?: number;
}

export interface N8nGuardrailCheckResponse {
  walletAddress: string;
  passed: boolean;
  blockedReason?: string;
  ruleName?: string;
}

export interface N8nRiskCheckRequest {
  walletAddress: string;
  chain: N8nSupportedChain;
  tokenAddress: string;
}

export interface N8nRiskCheckResponse {
  walletAddress: string;
  chain: N8nSupportedChain;
  tokenAddress: string;
  riskSummary: N8nContractRiskSummary | null;
  flags: string[];
}

export type TradeResult =
  | {
      success: true;
      txHash: string;
      amountIn: string;
      amountOut: string;
      rate: number;
    }
  | {
      success: false;
      failureCategory: FailureCategory;
      reason: string;
    };

export interface N8nExecuteTradeRequest {
  walletAddress: string;
  serverWalletId: string;
  serverWalletAddress: string;
  currency: string;
  direction: 'buy' | 'sell';
  amountUsd: number;
  chain?: N8nSupportedChain;
  inTokenAddress?: string;
  outTokenAddress?: string;
  slippageBps?: string;
}

export type N8nExecuteTradeResponse = { walletAddress: string } & TradeResult;

export interface N8nCommitAttestationRequest {
  walletAddress: string;
  agentType: 'fx' | 'yield';
  runId: string;
  agentId: string;
}

export interface N8nCommitAttestationResponse {
  walletAddress: string;
  attestationId: string | null;
  commitTxHash: string | null;
}
