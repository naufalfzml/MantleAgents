import type { FastifyInstance } from 'fastify';
import { createSupabaseAdmin } from '@mantleagents/db';
import { authMiddleware } from '../middleware/auth.js';
import { checkEligibility } from '../services/strategy-eligibility.js';
import { cloneStrategyToCanvas } from '../services/strategy-clone.js';
import { mantleExplorerTxUrl } from '../lib/chains.js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getPlatformTakeRate(): number {
  const val = parseFloat(process.env.PLATFORM_TAKE_RATE_PCT ?? '5');
  return isFinite(val) && val >= 0 ? val : 5;
}

export async function marketplaceRoutes(app: FastifyInstance) {
  // POST /marketplace/strategies — publish a strategy (auth required)
  app.post(
    '/marketplace/strategies',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user?.walletAddress;
      if (!walletAddress) return reply.status(401).send({ error: 'Unauthorized' });

      const body = request.body as {
        title?: string;
        description?: string;
        workflow_json?: Record<string, unknown>;
        rental_price?: number;
        agent_type?: string;
      };

      const { title, description, workflow_json, rental_price, agent_type } = body ?? {};
      if (!title || !workflow_json || !agent_type) {
        return reply.status(400).send({ error: 'title, workflow_json, and agent_type are required' });
      }

      const eligibility = await checkEligibility(walletAddress, agent_type);
      if (!eligibility.eligible) {
        return reply.status(422).send({ error: 'Ineligible to publish', issues: eligibility.issues });
      }

      const { data: strategyRow, error: insertError } = await (supabaseAdmin as any)
        .from('strategy_templates')
        .insert({
          owner_wallet: walletAddress,
          workflow_json,
          title,
          description: description ?? null,
          rental_price: rental_price ?? 0,
          status: 'listed',
          min_attestations_required: eligibility.attestationCount ?? 0,
        })
        .select()
        .single();

      if (insertError) {
        request.log.error({ err: insertError }, '[marketplace] strategy insert failed');
        return reply.status(500).send({ error: 'Failed to create strategy' });
      }

      await (supabaseAdmin as any).from('strategy_performance_snapshots').insert({
        strategy_id: strategyRow.id,
        period_start: eligibility.firstRunAt ?? null,
        period_end: eligibility.lastRunAt ?? null,
        roi_pct: eligibility.roiPct ?? 0,
        run_count: eligibility.attestationCount ?? 0,
        attestation_ids: [],
      });

      return reply.status(201).send(strategyRow);
    },
  );

  // GET /marketplace/strategies — public listing (no auth required)
  app.get('/marketplace/strategies', async (_request, reply) => {
    const { data: rows, error } = await (supabaseAdmin as any)
      .from('strategy_templates')
      .select(`
        id, title, description, owner_wallet, rental_price, status, created_at,
        strategy_performance_snapshots (
          id, roi_pct, run_count, period_start, period_end, created_at
        )
      `)
      .eq('status', 'listed')
      .order('created_at', { ascending: false });

    if (error) {
      return reply.status(500).send({ error: 'Failed to fetch strategies' });
    }

    const listings = (rows ?? []).map((row: Record<string, unknown>) => {
      const snapshots = (row.strategy_performance_snapshots as Array<{
        roi_pct: number;
        run_count: number;
        period_start: string | null;
        period_end: string | null;
        created_at: string;
      }> | null) ?? [];

      const latest = snapshots.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0];

      return {
        id: row.id,
        ownerWallet: row.owner_wallet,
        title: row.title,
        description: row.description,
        rentalPrice: row.rental_price,
        status: row.status,
        attestationCount: latest?.run_count ?? 0,
        roiPct: latest?.roi_pct ?? 0,
        periodStart: latest?.period_start ?? null,
        periodEnd: latest?.period_end ?? null,
        createdAt: row.created_at,
      };
    });

    return reply.send(listings);
  });

  // GET /marketplace/strategies/:id — strategy detail with attestation links
  app.get('/marketplace/strategies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: strategy, error } = await (supabaseAdmin as any)
      .from('strategy_templates')
      .select(`
        id, title, description, owner_wallet, rental_price, status, workflow_json,
        min_attestations_required, created_at,
        strategy_performance_snapshots (
          roi_pct, run_count, period_start, period_end, created_at
        )
      `)
      .eq('id', id)
      .eq('status', 'listed')
      .maybeSingle();

    if (error) {
      return reply.status(500).send({ error: 'Failed to fetch strategy' });
    }
    if (!strategy) {
      return reply.status(404).send({ error: 'Strategy not found' });
    }

    // Fetch attestations for the owner + all agent types (for detail view)
    const { data: attestations } = await (supabaseAdmin as any)
      .from('agent_attestations')
      .select('id, run_id, commit_tx_hash, created_at, agent_type')
      .eq('wallet_address', strategy.owner_wallet)
      .order('created_at', { ascending: false })
      .limit(50);

    const attestationLinks = ((attestations ?? []) as Array<{
      id: string;
      run_id: string;
      commit_tx_hash: string | null;
      created_at: string;
      agent_type: string;
    }>).map((a) => ({
      id: a.id,
      runId: a.run_id,
      agentType: a.agent_type,
      createdAt: a.created_at,
      commitTxHash: a.commit_tx_hash,
      explorerUrl: a.commit_tx_hash
        ? mantleExplorerTxUrl(a.commit_tx_hash)
        : null,
    }));

    const snapshots = (strategy.strategy_performance_snapshots as Array<{
      roi_pct: number;
      run_count: number;
      period_start: string | null;
      period_end: string | null;
      created_at: string;
    }> | null) ?? [];

    const latestSnapshot = snapshots.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    return reply.send({
      id: strategy.id,
      ownerWallet: strategy.owner_wallet,
      title: strategy.title,
      description: strategy.description,
      rentalPrice: strategy.rental_price,
      status: strategy.status,
      workflowJson: strategy.workflow_json,
      attestationCount: latestSnapshot?.run_count ?? 0,
      roiPct: latestSnapshot?.roi_pct ?? 0,
      periodStart: latestSnapshot?.period_start ?? null,
      periodEnd: latestSnapshot?.period_end ?? null,
      createdAt: strategy.created_at,
      attestations: attestationLinks,
    });
  });

  // POST /marketplace/strategies/:id/rent — rent a strategy (auth required)
  app.post(
    '/marketplace/strategies/:id/rent',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user?.walletAddress;
      if (!walletAddress) return reply.status(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };

      const { data: strategy, error: fetchError } = await (supabaseAdmin as any)
        .from('strategy_templates')
        .select('id, owner_wallet, workflow_json, title, rental_price, status')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) {
        return reply.status(500).send({ error: 'Failed to fetch strategy' });
      }
      if (!strategy || strategy.status !== 'listed') {
        return reply.status(404).send({ error: 'Strategy not found or not listed' });
      }
      if (strategy.owner_wallet === walletAddress) {
        return reply.status(400).send({ error: 'Cannot rent your own strategy' });
      }

      let n8nWorkflowId: string;
      try {
        n8nWorkflowId = await cloneStrategyToCanvas(
          walletAddress,
          strategy.workflow_json as Record<string, unknown>,
          strategy.title as string,
        );
      } catch (cloneErr) {
        request.log.error({ err: cloneErr }, '[marketplace] strategy clone failed');
        return reply.status(500).send({ error: 'Failed to clone strategy to canvas' });
      }

      const rentalPrice = Number(strategy.rental_price ?? 0);
      const platformFee = (rentalPrice * getPlatformTakeRate()) / 100;

      const { data: rental, error: rentalError } = await (supabaseAdmin as any)
        .from('strategy_rentals')
        .insert({
          strategy_id: id,
          renter_wallet: walletAddress,
          price_paid: rentalPrice,
          platform_fee: platformFee,
          n8n_workflow_id: n8nWorkflowId,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (rentalError) {
        request.log.error({ err: rentalError }, '[marketplace] rental insert failed');
        return reply.status(500).send({ error: 'Failed to record rental' });
      }

      return reply.status(201).send({
        rentalId: rental.id,
        n8nWorkflowId,
        message: `Strategy "${strategy.title}" cloned to your canvas`,
      });
    },
  );
}
