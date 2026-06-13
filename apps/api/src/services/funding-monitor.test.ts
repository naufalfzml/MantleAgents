/**
 * Unit tests for funding-monitor.ts
 *
 * The module-level `lastKnownBalances` Map is not exported, so we reset the
 * module between describe blocks (vi.resetModules) and re-import to get a
 * fresh Map.  Within a single test we can call checkForDeposits() twice to
 * exercise the "first call caches, second call detects" behaviour.
 */

// ---------------------------------------------------------------------------
// Mocks – vi.hoisted ensures these are available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockNot, mockSelect, mockFrom, mockReadContract, mockLogTimeline } = vi.hoisted(() => {
  const mockNot = vi.fn();
  const mockSelect = vi.fn().mockReturnValue({ not: mockNot });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
  const mockReadContract = vi.fn();
  const mockLogTimeline = vi.fn();
  return { mockNot, mockSelect, mockFrom, mockReadContract, mockLogTimeline };
});

vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('../lib/chain-client', () => ({
  chainClient: { readContract: mockReadContract },
}));

vi.mock('./agent-cron', () => ({
  logTimeline: mockLogTimeline,
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks are declared)
// ---------------------------------------------------------------------------

import { checkForDeposits } from './funding-monitor';
import { STABLE_TOKEN_ADDRESSES, USDC_ADDRESS, USDT_ADDRESS } from '@mantleagents/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SERVER_WALLET = '0xABCDef1234567890abcdef1234567890ABCDEF12';
const OWNER_WALLET = '0x1111111111111111111111111111111111111111';

/** Convenience: set up the supabase mock to return the given configs list. */
function mockConfigs(
  configs: Array<{ wallet_address: string; server_wallet_address: string | null }>,
  error: unknown = null,
) {
  mockNot.mockResolvedValue({ data: error ? null : configs, error });
}

/**
 * Build a readContract mock that returns specified balances per token symbol
 * for every call.  Order: USDm, USDC, USDT (matching MONITORED_TOKENS order).
 */
function mockBalances(usdm: bigint, usdc: bigint, usdt: bigint) {
  mockReadContract
    .mockResolvedValueOnce(usdm)  // USDm
    .mockResolvedValueOnce(usdc)  // USDC
    .mockResolvedValueOnce(usdt); // USDT
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('funding-monitor · checkForDeposits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Supabase query shape
  // -------------------------------------------------------------------------

  it('queries agent_configs with non-null server_wallet_address', async () => {
    mockConfigs([]);

    await checkForDeposits();

    expect(mockFrom).toHaveBeenCalledWith('agent_configs');
    expect(mockSelect).toHaveBeenCalledWith('wallet_address, server_wallet_address, server_wallet_id');
    expect(mockNot).toHaveBeenCalledWith('server_wallet_address', 'is', null);
  });

  // -------------------------------------------------------------------------
  // Balance reads
  // -------------------------------------------------------------------------

  it('calls balanceOf for USDm, USDC, USDT on each wallet', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(0n, 0n, 0n);

    await checkForDeposits();

    expect(mockReadContract).toHaveBeenCalledTimes(3);

    // USDm
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: STABLE_TOKEN_ADDRESSES.USDm,
        functionName: 'balanceOf',
        args: [SERVER_WALLET],
      }),
    );
    // USDC
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: USDC_ADDRESS,
        functionName: 'balanceOf',
        args: [SERVER_WALLET],
      }),
    );
    // USDT
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: USDT_ADDRESS,
        functionName: 'balanceOf',
        args: [SERVER_WALLET],
      }),
    );
  });

  // -------------------------------------------------------------------------
  // First check – no previous balance → no funding event
  // -------------------------------------------------------------------------

  it('does not log a funding event on the first check (no previous balance)', async () => {
    // Use a unique wallet address so the module-level Map has no prior entry
    const freshWallet = '0xFRESH000000000000000000000000000000000001';
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: freshWallet },
    ]);
    mockBalances(1000n, 2000n, 3000n);

    await checkForDeposits();

    expect(mockLogTimeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Second check – increased balance → logs deposit
  // -------------------------------------------------------------------------

  it('logs a funding event when balance increases between checks', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    // First call – seed the cache
    mockBalances(0n, 0n, 0n);
    await checkForDeposits();
    vi.clearAllMocks();

    // Second call – USDm increased
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(
      BigInt('5000000000000000000'), // 5 USDm (18 decimals)
      0n,
      0n,
    );
    await checkForDeposits();

    expect(mockLogTimeline).toHaveBeenCalledTimes(1);
    expect(mockLogTimeline).toHaveBeenCalledWith(OWNER_WALLET, 'funding', {
      summary: 'Received 5.00 USDm',
      detail: {
        token: 'USDm',
        amount: 5,
        rawAmount: '5000000000000000000',
      },
    });
  });

  // -------------------------------------------------------------------------
  // Second check – same balance → no event
  // -------------------------------------------------------------------------

  it('does not log a funding event when balance stays the same', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    // First call – seed
    mockBalances(1000n, 2000n, 3000n);
    await checkForDeposits();
    vi.clearAllMocks();

    // Second call – identical balances
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(1000n, 2000n, 3000n);
    await checkForDeposits();

    expect(mockLogTimeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Second check – decreased balance → no event
  // -------------------------------------------------------------------------

  it('does not log a funding event when balance decreases', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    // First call – seed with non-zero
    mockBalances(5000n, 5000n, 5000n);
    await checkForDeposits();
    vi.clearAllMocks();

    // Second call – balances dropped
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(1000n, 1000n, 1000n);
    await checkForDeposits();

    expect(mockLogTimeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Decimal formatting – USDm (18 decimals)
  // -------------------------------------------------------------------------

  it('formats USDm deposit with 18 decimals correctly', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    // Seed with zero
    mockBalances(0n, 0n, 0n);
    await checkForDeposits();
    vi.clearAllMocks();

    // Deposit 1.50 USDm = 1_500_000_000_000_000_000n
    const depositRaw = BigInt('1500000000000000000');
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(depositRaw, 0n, 0n);
    await checkForDeposits();

    expect(mockLogTimeline).toHaveBeenCalledWith(OWNER_WALLET, 'funding', {
      summary: 'Received 1.50 USDm',
      detail: {
        token: 'USDm',
        amount: 1.5,
        rawAmount: depositRaw.toString(),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Decimal formatting – USDC (6 decimals)
  // -------------------------------------------------------------------------

  it('formats USDC deposit with 6 decimals correctly', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    // Seed
    mockBalances(0n, 0n, 0n);
    await checkForDeposits();
    vi.clearAllMocks();

    // Deposit 25.75 USDC = 25_750_000 (6 decimals)
    const depositRaw = 25_750_000n;
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(0n, depositRaw, 0n);
    await checkForDeposits();

    expect(mockLogTimeline).toHaveBeenCalledWith(OWNER_WALLET, 'funding', {
      summary: 'Received 25.75 USDC',
      detail: {
        token: 'USDC',
        amount: 25.75,
        rawAmount: depositRaw.toString(),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Decimal formatting – USDT (6 decimals)
  // -------------------------------------------------------------------------

  it('formats USDT deposit with 6 decimals correctly', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    // Seed
    mockBalances(0n, 0n, 0n);
    await checkForDeposits();
    vi.clearAllMocks();

    // Deposit 100.00 USDT = 100_000_000 (6 decimals)
    const depositRaw = 100_000_000n;
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(0n, 0n, depositRaw);
    await checkForDeposits();

    expect(mockLogTimeline).toHaveBeenCalledWith(OWNER_WALLET, 'funding', {
      summary: 'Received 100.00 USDT',
      detail: {
        token: 'USDT',
        amount: 100,
        rawAmount: depositRaw.toString(),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Error handling – individual token check
  // -------------------------------------------------------------------------

  it('handles error on individual token check gracefully (continues to next token)', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Seed – USDm throws, USDC and USDT succeed
    mockReadContract
      .mockRejectedValueOnce(new Error('RPC timeout'))  // USDm fails
      .mockResolvedValueOnce(0n)                         // USDC ok
      .mockResolvedValueOnce(0n);                        // USDT ok

    await checkForDeposits();

    // Should not throw – function completes
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to check USDm balance'),
      expect.any(Error),
    );

    // USDC and USDT still checked (2 successful calls)
    expect(mockReadContract).toHaveBeenCalledTimes(3);

    consoleSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Empty configs list
  // -------------------------------------------------------------------------

  it('handles empty configs list (no-op, no balanceOf calls)', async () => {
    mockConfigs([]);

    await checkForDeposits();

    expect(mockReadContract).not.toHaveBeenCalled();
    expect(mockLogTimeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Query error
  // -------------------------------------------------------------------------

  it('returns early on query error without checking balances', async () => {
    mockConfigs([], { message: 'connection refused' });

    await checkForDeposits();

    expect(mockReadContract).not.toHaveBeenCalled();
    expect(mockLogTimeline).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Multiple wallets
  // -------------------------------------------------------------------------

  it('checks balances for multiple wallets independently', async () => {
    const WALLET_A = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const WALLET_B = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

    mockConfigs([
      { wallet_address: '0x0001', server_wallet_address: WALLET_A },
      { wallet_address: '0x0002', server_wallet_address: WALLET_B },
    ]);

    // 6 calls total: 3 tokens x 2 wallets
    mockReadContract.mockResolvedValue(0n);

    await checkForDeposits();

    // 3 tokens per wallet x 2 wallets = 6 calls
    expect(mockReadContract).toHaveBeenCalledTimes(6);
  });

  // -------------------------------------------------------------------------
  // Skips configs where server_wallet_address is null
  // -------------------------------------------------------------------------

  it('skips configs where server_wallet_address is null/falsy', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: null },
    ]);

    await checkForDeposits();

    expect(mockReadContract).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Multiple deposits in one check (multiple tokens)
  // -------------------------------------------------------------------------

  it('logs separate funding events when multiple tokens have deposits', async () => {
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);

    // Seed with zero
    mockBalances(0n, 0n, 0n);
    await checkForDeposits();
    vi.clearAllMocks();

    // Second check: all three tokens increased
    mockConfigs([
      { wallet_address: OWNER_WALLET, server_wallet_address: SERVER_WALLET },
    ]);
    mockBalances(
      BigInt('2000000000000000000'), // 2.00 USDm
      10_000_000n,                   // 10.00 USDC
      50_000_000n,                   // 50.00 USDT
    );
    await checkForDeposits();

    expect(mockLogTimeline).toHaveBeenCalledTimes(3);

    expect(mockLogTimeline).toHaveBeenCalledWith(OWNER_WALLET, 'funding', {
      summary: 'Received 2.00 USDm',
      detail: expect.objectContaining({ token: 'USDm' }),
    });
    expect(mockLogTimeline).toHaveBeenCalledWith(OWNER_WALLET, 'funding', {
      summary: 'Received 10.00 USDC',
      detail: expect.objectContaining({ token: 'USDC' }),
    });
    expect(mockLogTimeline).toHaveBeenCalledWith(OWNER_WALLET, 'funding', {
      summary: 'Received 50.00 USDT',
      detail: expect.objectContaining({ token: 'USDT' }),
    });
  });
});
