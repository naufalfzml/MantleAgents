import type { FastifyInstance } from 'fastify';
import { createSupabaseAdmin } from '@mantleagents/db';
import { authMiddleware } from '../middleware/auth.js';
import { generateWorkflow } from '../services/workflow-generator.js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function workflowGeneratorRoutes(app: FastifyInstance) {
  app.post(
    '/api/workflow/generate',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user?.walletAddress;
      if (!walletAddress) return reply.status(401).send({ error: 'Unauthorized' });

      const body = request.body as { prompt?: string } | undefined;
      const prompt = body?.prompt?.trim();
      if (!prompt) return reply.status(400).send({ error: 'prompt is required' });

      const { data: configRow } = await (supabaseAdmin as any)
        .from('agent_configs')
        .select('max_trade_size_pct, stop_loss_pct')
        .eq('wallet_address', walletAddress)
        .maybeSingle();

      const userConfig = {
        max_trade_size_pct: configRow?.max_trade_size_pct ?? null,
        stop_loss_pct: configRow?.stop_loss_pct ?? null,
      };

      try {
        const result = await generateWorkflow(prompt, userConfig, walletAddress);
        return reply.send(result);
      } catch (error) {
        request.log.error({ err: error }, '[workflow-generator] unexpected error');
        return reply.status(500).send({ error: 'Failed to generate workflow' });
      }
    },
  );
}
