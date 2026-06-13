import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { createSupabaseAdmin, type Database } from '@mantleagents/db';
import { formatEther } from 'viem';
import { MANTLE_NETWORK } from '../lib/chains.js';
import { publicClient } from '../lib/chain-client.js';
import { computeRiskScore, scoreToProfile } from '../lib/risk-scoring.js';
import { createServerWallet } from '../lib/thirdweb-wallet.js';
import { DEFAULT_GUARDRAILS, type RiskAnswers, type RiskProfile } from '@mantleagents/shared';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function userRoutes(app: FastifyInstance) {
  app.get(
    '/api/user/balance',
    { preHandler: authMiddleware },
    async (request) => {
      const walletAddress = request.user!.walletAddress as `0x${string}`;
      const balance = await publicClient.getBalance({ address: walletAddress });

      return {
        balance: formatEther(balance),
        hasFunds: balance > 0n,
        faucetUrl: MANTLE_NETWORK === 'testnet' ? 'https://faucet.sepolia.mantle.xyz' : null,
      };
    },
  );

  // Submit risk profile answers
  app.post(
    '/api/user/risk-profile',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;
      const answers = request.body as RiskAnswers;

      // Validate required fields
      if (!answers || typeof answers !== 'object') {
        return reply.status(400).send({ error: 'Request body is required' });
      }
      if (!answers.name || typeof answers.name !== 'string') {
        return reply.status(400).send({ error: 'name is required and must be a string' });
      }
      if (!answers.experience || !['beginner', 'some_experience', 'advanced'].includes(answers.experience)) {
        return reply.status(400).send({ error: 'experience must be one of: beginner, some_experience, advanced' });
      }
      if (!answers.horizon || !['short', 'medium', 'long'].includes(answers.horizon)) {
        return reply.status(400).send({ error: 'horizon must be one of: short, medium, long' });
      }
      if (!answers.volatility || !['sell', 'hold', 'buy'].includes(answers.volatility)) {
        return reply.status(400).send({ error: 'volatility must be one of: sell, hold, buy' });
      }
      if (!answers.investmentAmount || !['under_100', '100_1000', '1000_10000', 'over_10000'].includes(answers.investmentAmount)) {
        return reply.status(400).send({ error: 'investmentAmount must be one of: under_100, 100_1000, 1000_10000, over_10000' });
      }

      const score = computeRiskScore(answers);
      const profile = scoreToProfile(score);

      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .upsert(
          {
            wallet_address: walletAddress,
            display_name: answers.name,
            risk_profile: profile,
            risk_answers: answers as unknown as Database['public']['Tables']['user_profiles']['Insert']['risk_answers'],
            preferred_currencies: answers.currencies,
            // Don't set onboarding_completed here — wait until the full flow finishes
            // (funding + registration steps). Use POST /api/user/complete-onboarding.
          },
          { onConflict: 'wallet_address' },
        )
        .select()
        .single();

      if (error) {
        console.error('Failed to save risk profile:', error);
        return reply.status(500).send({ error: 'Failed to save risk profile' });
      }

      // Create server wallet and agent config
      let serverWalletAddress: string | null = null;
      try {
        // Check existing FX agent config (idempotency guard)
        const { data: existingConfig } = await supabaseAdmin
          .from('agent_configs')
          .select('server_wallet_id, server_wallet_address')
          .eq('wallet_address', walletAddress)
          .eq('agent_type', 'fx')
          .single();

        if (existingConfig?.server_wallet_id && existingConfig?.server_wallet_address) {
          serverWalletAddress = existingConfig.server_wallet_address;
        } else {
          // Create new thirdweb server wallet (idempotent for same identifier)
          const identifier = `agent-fx-${walletAddress.toLowerCase()}`;
          const wallet = await createServerWallet(identifier);
          serverWalletAddress = wallet.address;

          // Insert agent config with default guardrails based on risk profile
          const defaults = DEFAULT_GUARDRAILS[profile as RiskProfile] ?? DEFAULT_GUARDRAILS.moderate;

          await supabaseAdmin.from('agent_configs').upsert(
            {
              wallet_address: walletAddress,
              agent_type: 'fx',
              server_wallet_address: wallet.address,
              server_wallet_id: identifier,
              active: false,
              frequency: String(defaults.frequency),
              max_trade_size_pct: defaults.maxTradeSizePct,
              max_allocation_pct: defaults.maxAllocationPct,
              stop_loss_pct: defaults.stopLossPct,
              daily_trade_limit: defaults.dailyTradeLimit,
              allowed_currencies: answers.currencies.length > 0 ? answers.currencies : undefined,
            },
            { onConflict: 'wallet_address,agent_type' },
          );
        }
      } catch (walletErr) {
        console.error('Failed to create agent wallet:', walletErr);
        // Non-fatal — user profile is saved, wallet creation can be retried
      }

      return {
        profile: data,
        riskProfile: profile,
        score,
        serverWalletAddress,
      };
    },
  );

  // Mark onboarding as complete (called at end of full flow: questionnaire + funding + registration)
  app.post(
    '/api/user/complete-onboarding',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;

      const { error } = await supabaseAdmin
        .from('user_profiles')
        .update({ onboarding_completed: true })
        .eq('wallet_address', walletAddress);

      if (error) {
        return reply.status(500).send({ error: 'Failed to complete onboarding' });
      }

      return { success: true };
    },
  );

  // GET /api/user/agents — returns which agent types the user has configured
  app.get(
    '/api/user/agents',
    { preHandler: authMiddleware },
    async (request) => {
      const walletAddress = request.user!.walletAddress;
      const { data } = await supabaseAdmin
        .from('agent_configs')
        .select('agent_type, active, agent_8004_id')
        .eq('wallet_address', walletAddress);
      return { agents: data ?? [] };
    },
  );

  // Get current risk profile
  app.get(
    '/api/user/risk-profile',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;

      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .select('display_name, risk_profile, risk_answers, preferred_currencies, onboarding_completed')
        .eq('wallet_address', walletAddress)
        .single();

      if (error) {
        return reply.status(500).send({ error: 'Failed to fetch risk profile' });
      }

      return data;
    },
  );
}
