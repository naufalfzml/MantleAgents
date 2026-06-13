import type { FastifyInstance } from 'fastify';
import type { Chain } from '@mantleagents/mantle-data';
import { authMiddleware } from '../middleware/auth.js';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getAlerts,
  createAlert,
  deleteAlert,
} from '../services/token-monitor.js';
import { getTokenPrice } from '../services/price-service.js';

export async function monitorRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // Watchlist
  // -------------------------------------------------------------------------

  /** GET /api/monitor/watchlist — list user's watchlist with latest prices */
  app.get(
    '/api/monitor/watchlist',
    { preHandler: authMiddleware },
    async (request) => {
      const walletAddress = request.user!.walletAddress;
      const items = await getWatchlist(walletAddress);

      // Enrich with current prices
      const enriched = await Promise.all(
        items.map(async (item) => {
          let currentPrice = 0;
          try {
            currentPrice = await getTokenPrice(
              item.chain as Chain,
              item.token_address,
            );
          } catch {
            // price fetch failed — return 0
          }
          return { ...item, current_price: currentPrice };
        }),
      );

      return { watchlist: enriched };
    },
  );

  /** POST /api/monitor/watchlist — add token to watchlist */
  app.post(
    '/api/monitor/watchlist',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;
      const body = request.body as {
        chain?: string;
        token_address?: string;
        token_symbol?: string;
      };

      if (!body.chain || !body.token_address || !body.token_symbol) {
        return reply
          .status(400)
          .send({ error: 'chain, token_address, and token_symbol are required' });
      }

      const item = await addToWatchlist({
        walletAddress,
        chain: body.chain as Chain,
        tokenAddress: body.token_address,
        tokenSymbol: body.token_symbol,
      });

      return { item };
    },
  );

  /** DELETE /api/monitor/watchlist/:id — remove token from watchlist */
  app.delete(
    '/api/monitor/watchlist/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;
      const { id } = request.params as { id: string };

      await removeFromWatchlist(walletAddress, id);
      return { success: true };
    },
  );

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------

  /** GET /api/monitor/alerts — list user's price alerts */
  app.get(
    '/api/monitor/alerts',
    { preHandler: authMiddleware },
    async (request) => {
      const walletAddress = request.user!.walletAddress;
      const alerts = await getAlerts(walletAddress);
      return { alerts };
    },
  );

  /** POST /api/monitor/alerts — create a price alert */
  app.post(
    '/api/monitor/alerts',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;
      const body = request.body as {
        chain?: string;
        token_address?: string;
        token_symbol?: string;
        condition?: string;
        threshold?: number;
      };

      if (
        !body.chain ||
        !body.token_address ||
        !body.token_symbol ||
        !body.condition ||
        body.threshold == null
      ) {
        return reply.status(400).send({
          error:
            'chain, token_address, token_symbol, condition, and threshold are required',
        });
      }

      if (body.condition !== 'above' && body.condition !== 'below') {
        return reply
          .status(400)
          .send({ error: "condition must be 'above' or 'below'" });
      }

      if (typeof body.threshold !== 'number' || body.threshold <= 0) {
        return reply
          .status(400)
          .send({ error: 'threshold must be a positive number' });
      }

      const alert = await createAlert({
        walletAddress,
        chain: body.chain as Chain,
        tokenAddress: body.token_address,
        tokenSymbol: body.token_symbol,
        condition: body.condition,
        threshold: body.threshold,
      });

      return { alert };
    },
  );

  /** DELETE /api/monitor/alerts/:id — delete a price alert */
  app.delete(
    '/api/monitor/alerts/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const walletAddress = request.user!.walletAddress;
      const { id } = request.params as { id: string };

      await deleteAlert(walletAddress, id);
      return { success: true };
    },
  );
}
