import Fastify from 'fastify';
import { userRoutes } from './user';
import { systemRoutes } from './system';

const {
  mockGetBalance,
  mockIsRealClawConfigured,
  mockSupabaseClient,
} = vi.hoisted(() => {
  return {
    mockGetBalance: vi.fn(),
    mockIsRealClawConfigured: vi.fn(),
    mockSupabaseClient: {
      from: vi.fn(),
    },
  };
});

vi.mock('@jakartagents/db', () => ({
  createSupabaseAdmin: () => mockSupabaseClient,
}));

vi.mock('../lib/chain-client.js', () => ({
  publicClient: {
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
  },
  chainClient: {
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (request: any, reply: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization token' });
    }
    request.user = { walletAddress: '0x1111111111111111111111111111111111111111' };
  },
}));

vi.mock('../services/realclaw-executor.js', () => ({
  isRealClawConfigured: () => mockIsRealClawConfigured(),
}));

let app: ReturnType<typeof Fastify>;

beforeEach(async () => {
  mockGetBalance.mockReset();
  mockIsRealClawConfigured.mockReset();
  mockSupabaseClient.from.mockReset();

  app = Fastify();
  await app.register(userRoutes);
  await app.register(systemRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/user/balance', () => {
  it('returns hasFunds false for a zero balance', async () => {
    mockGetBalance.mockResolvedValue(0n);

    const res = await app.inject({
      method: 'GET',
      url: '/api/user/balance',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      balance: '0',
      hasFunds: false,
      faucetUrl: 'https://faucet.sepolia.mantle.xyz',
    });
    expect(mockGetBalance).toHaveBeenCalledWith({
      address: '0x1111111111111111111111111111111111111111',
    });
  });

  it('returns hasFunds true for a funded balance', async () => {
    mockGetBalance.mockResolvedValue(1_000_000_000_000_000_000n);

    const res = await app.inject({
      method: 'GET',
      url: '/api/user/balance',
      headers: { authorization: 'Bearer test-token' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      balance: '1',
      hasFunds: true,
      faucetUrl: 'https://faucet.sepolia.mantle.xyz',
    });
  });

  it('returns 401 when the JWT is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/user/balance',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Missing authorization token' });
    expect(mockGetBalance).not.toHaveBeenCalled();
  });
});

describe('GET /api/system/status', () => {
  it('returns realClawConfigured true when RealClaw is configured', async () => {
    mockIsRealClawConfigured.mockReturnValue(true);

    const res = await app.inject({
      method: 'GET',
      url: '/api/system/status',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      realClawConfigured: true,
      network: 'testnet',
    });
  });

  it('returns realClawConfigured false when RealClaw is not configured', async () => {
    mockIsRealClawConfigured.mockReturnValue(false);

    const res = await app.inject({
      method: 'GET',
      url: '/api/system/status',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      realClawConfigured: false,
      network: 'testnet',
    });
  });
});
