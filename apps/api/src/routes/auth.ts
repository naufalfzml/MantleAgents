import type { FastifyInstance } from 'fastify';
import { thirdwebAuth } from '../lib/thirdweb.js';
import { authMiddleware } from '../middleware/auth.js';
import { createSupabaseAdmin } from '@mantleagents/db';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function authRoutes(app: FastifyInstance) {
  // Generate SIWE login payload
  app.post('/api/auth/payload', async (request) => {
    const { address } = request.body as { address: string };
    const payload = await thirdwebAuth.generatePayload({ address });
    return payload;
  });

  // Verify signature and issue JWT
  app.post('/api/auth/login', async (request, reply) => {
    const { payload, signature } = request.body as {
      payload: unknown;
      signature: string;
    };

    const verifiedPayload = await thirdwebAuth.verifyPayload({
      payload: payload as Parameters<
        typeof thirdwebAuth.verifyPayload
      >[0]['payload'],
      signature,
    });

    if (!verifiedPayload.valid) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const jwt = await thirdwebAuth.generateJWT({
      payload: verifiedPayload.payload,
    });

    return { token: jwt };
  });

  // Get current user profile (protected)
  app.get(
    '/api/auth/me',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;

      // Upsert user profile
      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .upsert(
          { wallet_address: walletAddress },
          { onConflict: 'wallet_address' },
        )
        .select()
        .single();

      if (error) {
        return reply.status(500).send({ error: 'Failed to fetch user profile' });
      }

      return data;
    },
  );

  // Stateless JWT — token invalidation happens client-side.
  // For server-side revocation, implement a token blacklist.
  app.post('/api/auth/logout', async () => {
    return { success: true };
  });
}
