import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  N8nCommitAttestationRequest,
  N8nCommitAttestationResponse,
  N8nExecuteTradeRequest,
  N8nExecuteTradeResponse,
  N8nGuardrailCheckRequest,
  N8nGuardrailCheckResponse,
  N8nMarketDataRequest,
  N8nMarketDataResponse,
  N8nRiskCheckRequest,
  N8nRiskCheckResponse,
  N8nSignalAnalysisRequest,
  N8nSignalAnalysisResponse,
} from '@mantleagents/shared';
import { authMiddleware } from '../middleware/auth.js';
import { analyzeFxNews } from '../services/llm-analyzer.js';
import { getN8nMarketData } from '../services/market-data-service.js';
import { checkGuardrails } from '../services/rules-engine.js';
import { createAndAttachRunAttestation } from '../services/attestation-service.js';
import { executeTrade } from '../services/trade-executor.js';
import { checkAveContractRisk } from '../services/tools/market-data.js';
import { validateN8nApiKey } from '../services/n8n-security.js';
import { provisionUserWorkflow } from '../services/n8n-provisioner.js';

type N8nBridgeDependencies = {
  getMarketData: typeof getN8nMarketData;
  analyzeSignals: typeof analyzeFxNews;
  checkGuardrails: typeof checkGuardrails;
  checkRisk: typeof checkAveContractRisk;
  executeTrade: typeof executeTrade;
  commitAttestation: typeof createAndAttachRunAttestation;
};

export type N8nBridgeRoutesOptions = {
  bridgeSecret?: string | null;
  deps?: Partial<N8nBridgeDependencies>;
};

const defaultDeps: N8nBridgeDependencies = {
  getMarketData: getN8nMarketData,
  analyzeSignals: analyzeFxNews,
  checkGuardrails,
  checkRisk: checkAveContractRisk,
  executeTrade,
  commitAttestation: createAndAttachRunAttestation,
};

function getBridgeDisabledResponse() {
  return {
    error: 'n8n bridge is disabled: N8N_BRIDGE_API_KEY_SECRET is not configured',
  };
}

function ensureAuthorized(
  request: FastifyRequest,
  reply: FastifyReply,
  walletAddress: string | undefined,
  bridgeSecret: string,
): boolean {
  const apiKey = request.headers['x-n8n-api-key'];
  const providedKey = Array.isArray(apiKey) ? apiKey[0] : apiKey;

  if (!walletAddress || !validateN8nApiKey(walletAddress, providedKey, bridgeSecret)) {
    reply.status(401).send({ error: 'Invalid n8n API key' });
    return false;
  }

  return true;
}

export async function n8nBridgeRoutes(
  app: FastifyInstance,
  options: N8nBridgeRoutesOptions = {},
) {
  const bridgeSecret = options.bridgeSecret ?? process.env.N8N_BRIDGE_API_KEY_SECRET ?? null;
  const deps = {
    ...defaultDeps,
    ...options.deps,
  };

  if (!bridgeSecret) {
    app.log.warn('N8N_BRIDGE_API_KEY_SECRET is not set; /api/n8n routes are disabled');
    app.all('/*', async (_request, reply) =>
      reply.status(503).send(getBridgeDisabledResponse()),
    );
    return;
  }

  app.post('/market-data', async (request, reply) => {
    const body = request.body as N8nMarketDataRequest;
    if (!ensureAuthorized(request, reply, body?.walletAddress, bridgeSecret)) return;

    const { detail, kline, riskSummary } = await deps.getMarketData({
      chain: body.chain,
      tokenAddress: body.tokenAddress,
      klineInterval: body.klineInterval,
      klineLimit: body.klineLimit,
    });

    const response: N8nMarketDataResponse = {
      walletAddress: body.walletAddress,
      chain: body.chain,
      tokenAddress: body.tokenAddress,
      marketData: {
        symbol: detail.symbol,
        name: detail.name,
        priceUsd: detail.price,
        priceChange24hPct: detail.price_change_24h,
        marketCap: detail.market_cap,
        volume24h: detail.tx_volume_u_24h,
        holderCount: detail.holder_count,
      },
      kline,
      riskSummary: riskSummary
        ? {
            riskLevel: riskSummary.risk_level,
            riskScore: riskSummary.risk_score,
            honeypot: riskSummary.honeypot,
            buyTax: riskSummary.buy_tax,
            sellTax: riskSummary.sell_tax,
            owner: riskSummary.owner,
            ownershipRenounced: riskSummary.ownership_renounced,
            canMint: riskSummary.can_mint,
            canBurn: riskSummary.can_burn,
            holderConcentration: riskSummary.holder_concentration,
            dexLiquidity: riskSummary.dex_liquidity,
          }
        : null,
    };

    return reply.send(response);
  });

  app.post('/signal-analysis', async (request, reply) => {
    const body = request.body as N8nSignalAnalysisRequest;
    if (!ensureAuthorized(request, reply, body?.walletAddress, bridgeSecret)) return;

    const result = await deps.analyzeSignals({
      news: body.news,
      currentPositions: body.currentPositions,
      portfolioValueUsd: body.portfolioValueUsd,
      allowedCurrencies: body.allowedCurrencies,
      walletBalances: body.walletBalances,
      customPrompt: body.customPrompt,
    });

    const response: N8nSignalAnalysisResponse = {
      walletAddress: body.walletAddress,
      signals: result.signals,
      marketSummary: result.marketSummary,
      sourcesUsed: result.sourcesUsed,
    };

    return reply.send(response);
  });

  app.post('/guardrail-check', async (request, reply) => {
    const body = request.body as N8nGuardrailCheckRequest;
    if (!ensureAuthorized(request, reply, body?.walletAddress, bridgeSecret)) return;

    const result = deps.checkGuardrails({
      signal: body.signal,
      config: body.config,
      positions: body.positions,
      portfolioValueUsd: body.portfolioValueUsd,
      tradesToday: body.tradesToday,
      tradeAmountUsd: body.tradeAmountUsd,
      positionPrices: body.positionPrices,
      availableBuyingPowerUsd: body.availableBuyingPowerUsd,
    });

    const response: N8nGuardrailCheckResponse = {
      walletAddress: body.walletAddress,
      passed: result.passed,
      blockedReason: result.blockedReason,
      ruleName: result.ruleName,
    };

    return reply.send(response);
  });

  app.post('/risk-check', async (request, reply) => {
    const body = request.body as N8nRiskCheckRequest;
    if (!ensureAuthorized(request, reply, body?.walletAddress, bridgeSecret)) return;

    const riskSummary = await deps.checkRisk(body.chain, body.tokenAddress);
    const flags = riskSummary
      ? [
          riskSummary.honeypot ? 'honeypot' : null,
          riskSummary.can_mint ? 'mintable' : null,
          !riskSummary.ownership_renounced ? 'owner_controls_contract' : null,
          riskSummary.buy_tax > 10 ? 'high_buy_tax' : null,
          riskSummary.sell_tax > 10 ? 'high_sell_tax' : null,
        ].filter((flag): flag is string => Boolean(flag))
      : [];

    const response: N8nRiskCheckResponse = {
      walletAddress: body.walletAddress,
      chain: body.chain,
      tokenAddress: body.tokenAddress,
      riskSummary: riskSummary
        ? {
            riskLevel: riskSummary.risk_level,
            riskScore: riskSummary.risk_score,
            honeypot: riskSummary.honeypot,
            buyTax: riskSummary.buy_tax,
            sellTax: riskSummary.sell_tax,
            owner: riskSummary.owner,
            ownershipRenounced: riskSummary.ownership_renounced,
            canMint: riskSummary.can_mint,
            canBurn: riskSummary.can_burn,
            holderConcentration: riskSummary.holder_concentration,
            dexLiquidity: riskSummary.dex_liquidity,
          }
        : null,
      flags,
    };

    return reply.send(response);
  });

  app.post('/execute-trade', async (request, reply) => {
    const body = request.body as N8nExecuteTradeRequest;
    if (!ensureAuthorized(request, reply, body?.walletAddress, bridgeSecret)) return;

    const result = await deps.executeTrade({
      serverWalletId: body.serverWalletId,
      serverWalletAddress: body.serverWalletAddress,
      currency: body.currency,
      direction: body.direction,
      amountUsd: body.amountUsd,
      chain: body.chain,
      inTokenAddress: body.inTokenAddress,
      outTokenAddress: body.outTokenAddress,
      slippageBps: body.slippageBps,
    });

    const response: N8nExecuteTradeResponse = {
      walletAddress: body.walletAddress,
      ...result,
    };

    return reply.send(response);
  });

  app.post('/commit-attestation', async (request, reply) => {
    const body = request.body as N8nCommitAttestationRequest;
    if (!ensureAuthorized(request, reply, body?.walletAddress, bridgeSecret)) return;

    const result = await deps.commitAttestation({
      walletAddress: body.walletAddress,
      agentType: body.agentType,
      runId: body.runId,
      agentId: BigInt(body.agentId),
    });

    const response: N8nCommitAttestationResponse = {
      walletAddress: body.walletAddress,
      attestationId: result?.attestationId ?? null,
      commitTxHash: result?.commitTxHash ?? null,
    };

    return reply.send(response);
  });

  app.get(
    '/provision',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user?.walletAddress;
      if (!walletAddress) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const result = await provisionUserWorkflow(walletAddress);
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, '[n8n] provision failed');
        return reply.status(500).send({ error: 'Failed to provision workflow' });
      }
    },
  );
}
