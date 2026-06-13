import type { FastifyInstance } from 'fastify';
import type { Chain } from '@mantleagents/mantle-data';
import { getMarketTokens } from '../services/market-data-service.js';
import { getTokenPrice } from '../services/price-service.js';

export async function marketRoutes(app: FastifyInstance) {
  app.get('/api/market/tokens', async () => {
    const tokens = await getMarketTokens();
    return {
      tokens,
      updatedAt: new Date().toISOString(),
    };
  });

  /**
   * Get price for a single token by chain + address.
   * Query params: chain, address
   */
  app.get('/api/market/token-price', async (request, reply) => {
    const query = request.query as { chain?: string; address?: string };
    const chain = (query.chain ?? 'bsc') as Chain;
    const address = query.address;

    if (!address) {
      return reply.status(400).send({ error: 'address query param required' });
    }

    try {
      const priceUsd = await getTokenPrice(chain, address);
      return {
        priceUsd,
        chain,
        address,
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      app.log.warn(err, 'Failed to fetch token price');
      return { priceUsd: 0, updatedAt: new Date().toISOString() };
    }
  });
}
