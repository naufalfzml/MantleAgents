import { describe, it, expect, vi, beforeEach } from 'vitest';

// Chainable mock for Supabase query builder
function createChainableMock(resolvedValue: unknown = { data: [], error: null }) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  const chainable = new Proxy(mock, {
    get(target, prop: string) {
      if (prop === 'then') return undefined;
      if (!target[prop]) {
        target[prop] = vi.fn().mockReturnValue(
          new Proxy(target, {
            get(t, p: string) {
              if (p === 'then') {
                return (resolve: (value: unknown) => void) => resolve(resolvedValue);
              }
              if (!t[p]) {
                t[p] = vi.fn().mockReturnValue(
                  new Proxy({}, {
                    get(_, innerP: string) {
                      if (innerP === 'then') {
                        return (resolve: (value: unknown) => void) => resolve(resolvedValue);
                      }
                      return vi.fn().mockReturnValue(
                        new Proxy({}, {
                          get(_, deepP: string) {
                            if (deepP === 'then') {
                              return (resolve: (value: unknown) => void) => resolve(resolvedValue);
                            }
                            return vi.fn().mockReturnValue(
                              new Proxy({}, {
                                get(_, veryDeepP: string) {
                                  if (veryDeepP === 'then') {
                                    return (resolve: (value: unknown) => void) => resolve(resolvedValue);
                                  }
                                  return vi.fn();
                                },
                              })
                            );
                          },
                        })
                      );
                    },
                  })
                );
              }
              return t[p];
            },
          })
        );
      }
      return target[prop];
    },
  });
  return chainable;
}

const mockFrom = vi.hoisted(() => vi.fn());
vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: vi.fn().mockReturnValue({
    from: mockFrom,
  }),
}));

vi.mock('@mantleagents/shared', () => ({
  getTokenAddress: vi.fn().mockReturnValue('0xEURm'),
}));

import { getPositions, calculatePortfolioValue, updatePositionAfterTrade } from './position-tracker';

describe('position-tracker', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe('getPositions', () => {
    it('returns positions with balance > 0', async () => {
      const positions = [
        { wallet_address: '0xWALLET', token_symbol: 'EURm', token_address: '0xEURm', balance: 100, avg_entry_rate: 0.92 },
      ];
      mockFrom.mockReturnValue(createChainableMock({ data: positions, error: null }));

      const result = await getPositions('0xWALLET');
      expect(result).toHaveLength(1);
      expect(result[0].token_symbol).toBe('EURm');
      expect(result[0].balance).toBe(100);
    });

    it('throws on database error', async () => {
      mockFrom.mockReturnValue(createChainableMock({ data: null, error: { message: 'DB error' } }));

      await expect(getPositions('0xWALLET')).rejects.toThrow('Failed to fetch positions');
    });
  });

  describe('calculatePortfolioValue', () => {
    it('sums positions * price from snapshots', async () => {
      const positions = [
        { wallet_address: '0xW', token_symbol: 'EURm', token_address: '0x', balance: 100, avg_entry_rate: 0.92 },
      ] as any[];

      mockFrom.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { price_usd: 1.08 }, error: null }),
              }),
            }),
          }),
        }),
      }));

      const value = await calculatePortfolioValue(positions);
      expect(value).toBeCloseTo(108, 0);
    });

    it('defaults price to $1 when no snapshot', async () => {
      const positions = [
        { wallet_address: '0xW', token_symbol: 'EURm', token_address: '0x', balance: 50, avg_entry_rate: 0.92 },
      ] as any[];

      mockFrom.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }));

      const value = await calculatePortfolioValue(positions);
      expect(value).toBe(50);
    });
  });

  describe('updatePositionAfterTrade', () => {
    it('inserts new position on buy when none exists', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agent_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            upsert: upsertMock,
          };
        }
        return createChainableMock();
      });

      await updatePositionAfterTrade({
        walletAddress: '0xWALLET',
        currency: 'EURm',
        direction: 'buy',
        amountUsd: 100,
        rate: 0.95,
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          wallet_address: '0xWALLET',
          token_symbol: 'EURm',
          balance: 95, // 100 * 0.95
          avg_entry_rate: expect.closeTo(100 / 95, 5), // amountUsd / tokensAcquired = 1/rate
        }),
        expect.any(Object)
      );
    });

    it('updates existing position balance on buy', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agent_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { balance: 50, avg_entry_rate: 1.0 },
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: upsertMock,
          };
        }
        return createChainableMock();
      });

      await updatePositionAfterTrade({
        walletAddress: '0xWALLET',
        currency: 'EURm',
        direction: 'buy',
        amountUsd: 100,
        rate: 0.95,
      });

      // newBalance = 50 + (100 * 0.95) = 145
      // newAvgRate = ((50 * 1.0) + 100) / 145 = 150 / 145
      const expectedAvgRate = (50 * 1.0 + 100) / 145;
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 145, // 50 + (100 * 0.95)
          avg_entry_rate: expect.closeTo(expectedAvgRate, 5),
        }),
        expect.any(Object)
      );
    });

    it('reduces balance on sell (min 0)', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agent_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { balance: 10, avg_entry_rate: 0.92 },
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: upsertMock,
          };
        }
        return createChainableMock();
      });

      await updatePositionAfterTrade({
        walletAddress: '0xWALLET',
        currency: 'EURm',
        direction: 'sell',
        amountUsd: 100,
        rate: 0.95,
      });

      // 10 - (100 * 0.95) = -85, clamped to 0
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          balance: 0,
        }),
        expect.any(Object)
      );
    });

    it('preserves avg rate on sell', async () => {
      const upsertMock = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agent_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { balance: 200, avg_entry_rate: 0.92 },
                    error: null,
                  }),
                }),
              }),
            }),
            upsert: upsertMock,
          };
        }
        return createChainableMock();
      });

      await updatePositionAfterTrade({
        walletAddress: '0xWALLET',
        currency: 'EURm',
        direction: 'sell',
        amountUsd: 50,
        rate: 0.95,
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          avg_entry_rate: 0.92, // preserved
        }),
        expect.any(Object)
      );
    });

    it('throws on upsert error', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'agent_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            upsert: vi.fn().mockResolvedValue({ error: { message: 'upsert failed' } }),
          };
        }
        return createChainableMock();
      });

      await expect(
        updatePositionAfterTrade({
          walletAddress: '0xWALLET',
          currency: 'EURm',
          direction: 'buy',
          amountUsd: 100,
          rate: 0.95,
        })
      ).rejects.toThrow('Failed to update position for EURm: upsert failed');
    });
  });
});
