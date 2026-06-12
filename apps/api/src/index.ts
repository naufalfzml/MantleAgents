import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/user.js';
import { marketRoutes } from './routes/market.js';
import { overviewRoutes } from './routes/overview.js';
import { tradeRoutes } from './routes/trade.js';
import { agentRoutes } from './routes/agent.js';
import { wsRoutes } from './routes/ws.js';
import { yieldAgentRoutes } from './routes/yield-agent.js';
import { conversationRoutes } from './routes/conversation.js';
import { selfclawRoutes } from './routes/selfclaw.js';
import { monitorRoutes } from './routes/monitor.js';
import { n8nBridgeRoutes } from './routes/n8n-bridge.js';
import { systemRoutes } from './routes/system.js';
import { startPriceSnapshotCron } from './services/snapshot-cron.js';
import { startAgentCron } from './services/agent-cron.js';
import { startMonitorCron } from './services/token-monitor.js';

const PORT = parseInt(process.env.PORT || '4000', 10);

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'warn',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  },
});

await app.register(cors, {
  origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()),
  credentials: true,
});

await app.register(websocket);

// Simple in-memory rate limiting for sensitive endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  '/api/auth/login': 10,
  '/api/auth/payload': 20,
  '/api/agent/run-now': 5,
  '/api/trade/execute': 10,
  '/api/yield-agent/run-now': 5,
};

const RATE_LIMIT_PREFIXES: Array<{ prefix: string; limit: number }> = [
  { prefix: '/api/conversation/', limit: 30 },
];

app.addHook('onRequest', async (request, reply) => {
  const path = request.url.split('?')[0];
  let limit = RATE_LIMITS[path];
  if (!limit) {
    const prefixMatch = RATE_LIMIT_PREFIXES.find((p) => path.startsWith(p.prefix));
    limit = prefixMatch?.limit ?? 0;
  }
  if (!limit) return;

  const ip = request.ip;
  const key = `${ip}:${path}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  entry.count++;
  if (entry.count > limit) {
    return reply.status(429).send({ error: 'Too many requests' });
  }
});

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

// Health check
app.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Routes
await app.register(authRoutes);
await app.register(systemRoutes);
await app.register(userRoutes);
await app.register(marketRoutes);
await app.register(overviewRoutes);
await app.register(tradeRoutes);
await app.register(agentRoutes);
await app.register(wsRoutes);
await app.register(yieldAgentRoutes);
await app.register(conversationRoutes);
await app.register(selfclawRoutes);
await app.register(monitorRoutes);
await app.register(n8nBridgeRoutes, { prefix: '/api/n8n' });

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API server running on http://localhost:${PORT}`);
  startPriceSnapshotCron();
  startAgentCron();
  startMonitorCron();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
