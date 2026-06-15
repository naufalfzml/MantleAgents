import { randomUUID } from 'node:crypto';
import { type Address } from 'viem';
import { createSupabaseAdmin, type Database } from '@mantleagents/db';
import {
  DEFAULT_GUARDRAILS,
  MAX_ADAPTATIONS_PER_TICK,
  STABLE_TOKENS,
  parseFrequencyToMs,
  type AgentFrequency,
  type ProgressStep,
  type TradeSignal,
} from '@mantleagents/shared';
import { getPositions, calculatePortfolioValue, updatePositionAfterTrade } from './position-tracker.js';
import {
  upsertYieldPositionAfterDeposit,
  clearYieldPositionAfterWithdraw,
  syncYieldPositionsFromChain,
} from './yield-position-tracker.js';
import {
  calculateTradeAmount,
  evaluateAdaptedPlan,
  type AgentConfigForRules,
} from './rules-engine.js';
import { emitProgress } from './agent-events.js';
import { submitTradeFeedback } from './agent-registry.js';
import { createAndAttachRunAttestation } from './attestation-service.js';
import { getStrategy } from './strategies/index.js';
import type { WalletBalance } from './strategies/types.js';
import { formatExecutionError } from '../lib/format-error.js';
import { getWatchlist } from './token-monitor.js';
import { getWalletBalances } from './dune-balances.js';

type AgentConfigRow = Database['public']['Tables']['agent_configs']['Row'];
type TimelineInsert = Database['public']['Tables']['agent_timeline']['Insert'];

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TICK_INTERVAL_MS = 60_000; // Check every minute

function stringifyDecisionSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, currentValue) =>
    typeof currentValue === 'bigint' ? currentValue.toString() : currentValue,
  );
}

function getFxRulesConfig(
  config: AgentConfigRow,
  availableBuyingPowerUsd: number,
): AgentConfigForRules {
  const rawAllowed = (config.allowed_currencies ?? []) as string[];
  const allowedCurrencies =
    rawAllowed.length === 0 || rawAllowed.includes('ALL')
      ? STABLE_TOKENS.filter((token) => token !== 'USDm')
      : rawAllowed;
  const defaults = DEFAULT_GUARDRAILS.moderate;

  return {
    maxTradeSizePct: config.max_trade_size_pct ?? defaults.maxTradeSizePct,
    maxAllocationPct: config.max_allocation_pct ?? defaults.maxAllocationPct,
    stopLossPct: config.stop_loss_pct ?? defaults.stopLossPct,
    dailyTradeLimit: config.daily_trade_limit ?? defaults.dailyTradeLimit,
    allowedCurrencies,
    blockedCurrencies: (config.blocked_currencies ?? []) as string[],
    availableBuyingPowerUsd,
  };
}

/**
 * Start the agent cron loop. Called once on server boot.
 */
export function startAgentCron(): void {
  console.log('Starting agent cron (tick every 60s)');
  agentTick();
  setInterval(agentTick, TICK_INTERVAL_MS);
}

async function agentTick(): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Find agents that are active and due to run
    const { data: rawAgents, error } = await supabaseAdmin
      .from('agent_configs')
      .select('*')
      .eq('active', true)
      .lte('next_run_at', now);

    if (error) {
      console.error('Agent tick: failed to query due agents:', error);
      return;
    }

    const dueAgents = (rawAgents ?? []) as AgentConfigRow[];
    if (dueAgents.length === 0) return;

    console.log(`Agent tick: ${dueAgents.length} agent(s) due to run`);

    for (const config of dueAgents) {
      const freqMs = parseFrequencyToMs(config.frequency);
      try {
        await runAgentCycle(config);

        // Success — schedule next run at normal interval
        const nextRun = new Date(Date.now() + freqMs).toISOString();
        const { error: updateError } = await supabaseAdmin
          .from('agent_configs')
          .update({ last_run_at: new Date().toISOString(), next_run_at: nextRun, updated_at: new Date().toISOString() })
          .eq('id', config.id);
        if (updateError) {
          console.error(`Failed to update next_run_at for ${config.wallet_address}:`, updateError);
        }
      } catch (err) {
        console.error(`Agent cycle failed for ${config.wallet_address}:`, err);
        const agentType = (config as any).agent_type ?? 'fx';
        await logTimeline(config.wallet_address, 'system', {
          summary: `Agent cycle failed: ${formatExecutionError(err)}`,
        }, undefined, agentType);

        // Failure — retry in 5 minutes instead of full interval
        const retryRun = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from('agent_configs')
          .update({ next_run_at: retryRun, updated_at: new Date().toISOString() })
          .eq('id', config.id);
      }
    }
  } catch (err) {
    console.error('Agent tick error:', err);
  }
}

/**
 * Run a single agent cycle. Dispatches to the correct strategy based on agent_type.
 */
export async function runAgentCycle(config: AgentConfigRow): Promise<void> {
  const walletAddress = config.wallet_address;
  const agentType = (config as any).agent_type ?? 'fx';
  const runId = randomUUID();

  console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Starting cycle (runId=${runId.slice(0, 8)})`);

  // Validate server wallet exists before executing any trades
  if (!config.server_wallet_id || !config.server_wallet_address) {
    throw new Error('Server wallet not configured — skipping agent cycle');
  }

  // Load the strategy for this agent type
  const strategy = getStrategy(agentType);
  const progressSteps = strategy.getProgressSteps() as ProgressStep[];
  const attachRunAttestationIfPossible = async () => {
    if (config.agent_8004_id == null) {
      console.warn(
        `[agent:${walletAddress.slice(0, 8)}:${agentType}] Skipping attestation: agent_8004_id is missing`,
      );
      return;
    }

    try {
      await createAndAttachRunAttestation({
        walletAddress,
        agentType: agentType as 'fx' | 'yield',
        runId,
        agentId: BigInt(config.agent_8004_id),
      });
    } catch (error) {
      console.error(
        `[agent:${walletAddress.slice(0, 8)}:${agentType}] Failed to create run attestation:`,
        error,
      );
    }
  };

  try {
    // 1. Log cycle start
    await logTimeline(walletAddress, 'system', { summary: `${agentType.toUpperCase()} agent cycle started` }, runId, agentType);

    // 2. Fetch positions, portfolio value, and on-chain wallet balances
    console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Fetching positions...`);
    const walletBalances = await getOnChainBalances(config.server_wallet_address);
    let positions: Array<Record<string, unknown>>;
    let portfolioValue: number;

    if (agentType === 'yield') {
      // Sync DB with on-chain: clear any rows where user withdrew manually
      await syncYieldPositionsFromChain({
        walletAddress,
        serverWalletAddress: config.server_wallet_address,
      });

      const { data: yieldPositions } = await supabaseAdmin
        .from('yield_positions')
        .select('*')
        .eq('wallet_address', walletAddress)
        .gt('lp_shares', 0);
      positions = (yieldPositions ?? []) as Array<Record<string, unknown>>;
      const vaultValue = positions.reduce(
        (sum, p) => sum + Number(p.deposit_amount_usd ?? 0),
        0,
      );
      const liquidValue = walletBalances.reduce((s, b) => s + b.valueUsd, 0);
      portfolioValue = vaultValue + liquidValue;
      console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Portfolio: $${portfolioValue.toFixed(2)} (vault: $${vaultValue.toFixed(2)}, liquid: $${liquidValue.toFixed(2)}), ${positions.length} positions`);
    } else {
      const fxPositions = await getPositions(walletAddress);
      positions = fxPositions as unknown as Array<Record<string, unknown>>;
      portfolioValue = await calculatePortfolioValue(fxPositions);
      console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Portfolio: $${portfolioValue.toFixed(2)}, ${positions.length} positions`);
    }

    // 2b. Log balance summary
    const balanceSummary = walletBalances
      .filter(b => b.balance > 0)
      .map(b => `${b.symbol}: ${b.formatted}`)
      .join(', ') || 'Empty wallet';
    console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] On-chain balances: ${balanceSummary}`);

    // Build shared strategy context
    const strategyContext = {
      positions,
      portfolioValueUsd: portfolioValue,
      walletBalances,
      runId,
    };

    // 3. STRATEGY: Fetch data (news for FX, vault opportunities for yield)
    const fetchStep = progressSteps[0] ?? ('fetching_news' as ProgressStep);
    console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Fetching data...`);
    emitProgress(walletAddress, fetchStep, `Fetching data for ${agentType} agent...`);
    const data = await strategy.fetchData(config, strategyContext);

    // 4. STRATEGY: Analyze with LLM
    const analyzeStep = progressSteps[1] ?? ('analyzing' as ProgressStep);
    console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Running analysis...`);
    emitProgress(walletAddress, analyzeStep, `Analyzing with AI...`);
    const analysisResult = await strategy.analyze(data, config, strategyContext);

    const { signals, summary, sourcesUsed } = analysisResult;

    if (signals.length === 0) {
      await logTimeline(walletAddress, 'analysis', {
        summary: `${agentType.toUpperCase()}: No signals generated. ${summary}`,
        detail: { summary, sourcesUsed },
      }, runId, agentType);
      emitProgress(walletAddress, 'complete', summary || 'No actionable signals.', {
        signalCount: 0, tradeCount: 0, blockedCount: 0,
      });
      await attachRunAttestationIfPossible();
      return;
    }

    // Log analysis
    await logTimeline(walletAddress, 'analysis', {
      summary: `${agentType.toUpperCase()}: ${signals.length} signals. ${summary}`,
      detail: { summary, signalCount: signals.length, signals, sourcesUsed },
    }, runId, agentType);

    // Skip execution if wallet is empty (exploration mode only)
    // FX: portfolioValue only counts DB positions; include on-chain wallet balances for "has funds" check
    const totalInvestableValue =
      agentType === 'fx'
        ? portfolioValue + walletBalances.reduce((s, b) => s + b.valueUsd, 0)
        : portfolioValue;
    if (totalInvestableValue === 0) {
      console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Wallet empty - skipping execution`);
      emitProgress(
        walletAddress,
        'complete',
        'Analysis complete - add funds to your wallet to start investing',
        { signalCount: signals.length, tradeCount: 0, blockedCount: 0 },
        agentType
      );
      await logTimeline(walletAddress, 'system', {
        summary: 'Wallet empty - add funds to execute trades',
        detail: { signals, portfolioValue: 0 },
      }, runId, agentType);
      await attachRunAttestationIfPossible();
      return;
    }

    // 5. STRATEGY: Check guardrails and execute each signal
    const guardrailStep = progressSteps[2] ?? ('checking_signals' as ProgressStep);
    const executeStep = progressSteps[3] ?? ('executing_trades' as ProgressStep);
    const tradesToday = await getTradeCountToday(walletAddress, agentType);

    // Build price map for guardrails (FX uses token_symbol; yield positions don't have it)
    const positionPrices: Record<string, number> = {};
    if (agentType === 'fx') {
      for (const pos of positions) {
        const tokenSymbol = pos.token_symbol as string | undefined;
        if (!tokenSymbol) continue;
        const { data: snapshot } = await supabaseAdmin
          .from('token_price_snapshots')
          .select('price_usd')
          .eq('token_symbol', tokenSymbol)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        positionPrices[tokenSymbol] = (snapshot as { price_usd: number } | null)?.price_usd ?? 1;
      }
    }

    // FX: available buying power = sum of USDC + USDT + USDm (Option C base + Option D cap)
    const BASE_STABLE_SYMBOLS = ['USDC', 'USDT', 'USDm'];
    let availableBuyingPowerUsd =
      agentType === 'fx'
        ? walletBalances
            .filter((b) => BASE_STABLE_SYMBOLS.includes(b.symbol))
            .reduce((s, b) => s + b.valueUsd, 0)
        : 0;

    const guardrailContext = {
      positions,
      portfolioValueUsd: portfolioValue,
      dailyTradeCount: tradesToday,
      positionPrices,
      availableBuyingPowerUsd: agentType === 'fx' ? availableBuyingPowerUsd : undefined,
    };

    const wallet = {
      serverWalletId: config.server_wallet_id,
      serverWalletAddress: config.server_wallet_address,
    };
    const watchlistCandidates =
      agentType === 'fx' ? await getWatchlist(walletAddress).catch(() => []) : [];

    let tradeCount = 0;
    let blockedCount = 0;
    let decisionInputLogged = false;

    for (const signal of signals) {
      const s = signal as any;
      const signalLabel = s.currency ?? s.vaultName ?? s.vaultAddress?.slice(0, 10) ?? 'unknown';
      const signalAction = s.direction ?? s.action ?? 'unknown';

      // Skip hold signals
      if (signalAction === 'hold') continue;

      // Skip low confidence
      if ((s.confidence ?? 0) < 60 && agentType === 'fx') continue;

      // FX signals from LLM have allocationPct/confidence but not amountUsd — derive it before guardrails/execution
      // Option C: maxTradeUsd = availableBuyingPowerUsd * (maxTradeSizePct/100)
      if (agentType === 'fx' && (s.amountUsd == null || typeof s.amountUsd !== 'number')) {
        const maxTradeSizePct = (config as any).max_trade_size_pct ?? 25;
        const maxTradeUsd = availableBuyingPowerUsd * (maxTradeSizePct / 100);
        s.amountUsd = calculateTradeAmount(s.confidence ?? 0, maxTradeUsd);
      }

      // Skip if no trade amount (e.g. confidence < 60 returned 0)
      if (agentType === 'fx' && (!s.amountUsd || s.amountUsd <= 0)) continue;

      // Option D: Cap buy amount by available balance (avoid "Insufficient balance" at execution)
      if (agentType === 'fx' && signalAction === 'buy' && availableBuyingPowerUsd > 0) {
        const capped = Math.min(s.amountUsd, availableBuyingPowerUsd);
        if (capped < 0.1) {
          emitProgress(walletAddress, executeStep, `Skipping ${signalLabel}: insufficient balance ($${availableBuyingPowerUsd.toFixed(2)} left)`);
          continue;
        }
        s.amountUsd = capped;
      }

      // Check guardrails
      emitProgress(walletAddress, guardrailStep, `Checking guardrails for ${signalLabel}...`);
      const check = strategy.checkGuardrails(signal, config, guardrailContext);

      if (!check.passed) {
        blockedCount++;
        emitProgress(walletAddress, guardrailStep,
          `Blocked ${signalLabel} ${signalAction} — ${check.blockedReason}`,
        );
        await logTimeline(walletAddress, 'guardrail', {
          summary: `Blocked ${signalLabel} ${signalAction} — ${check.blockedReason}`,
          detail: { rule: check.ruleName, signal },
        }, runId, agentType);
        continue;
      }

      if (!decisionInputLogged) {
        const snapshot = {
          signal: JSON.parse(JSON.stringify(signal)) as Record<string, unknown>,
          guardrailParams:
            agentType === 'fx'
              ? {
                  ...getFxRulesConfig(config, availableBuyingPowerUsd),
                  dailyTradeCount: tradesToday,
                  ruleCheck: {
                    passed: check.passed,
                    ruleName: check.ruleName ?? null,
                    blockedReason: check.blockedReason ?? null,
                  },
                }
              : {
                  strategyParams: (config.strategy_params ?? {}) as Record<string, unknown>,
                  dailyTradeCount: tradesToday,
                  ruleCheck: {
                    passed: check.passed,
                    ruleName: check.ruleName ?? null,
                    blockedReason: check.blockedReason ?? null,
                  },
                },
          marketDataSnapshot: {
            fetchedData: data as Record<string, unknown>,
            portfolioValueUsd: portfolioValue,
            positions: positions as Record<string, unknown>[],
            walletBalances,
            analysisSummary: summary,
            sourcesUsed,
          },
        };

        await logTimeline(
          walletAddress,
          'decision_input',
          {
            summary: stringifyDecisionSnapshot(snapshot),
            detail: snapshot,
            confidencePct:
              typeof s.confidence === 'number' ? s.confidence : undefined,
            currency: agentType === 'fx' ? s.currency : undefined,
            amountUsd: typeof s.amountUsd === 'number' ? s.amountUsd : undefined,
            direction:
              agentType === 'fx' &&
              (s.direction === 'buy' || s.direction === 'sell')
                ? s.direction
                : undefined,
          },
          runId,
          agentType,
        );
        decisionInputLogged = true;
      }

      const baseSignal =
        agentType === 'fx'
          ? ({
              currency: s.currency,
              direction: s.direction,
              confidence: s.confidence,
              reasoning: s.reasoning,
              amountUsd: s.amountUsd,
            } satisfies TradeSignal)
          : null;

      // Execute signal
      try {
        let signalToExecute: unknown = signal;
        let adaptationCount = 0;

        while (true) {
          const current = signalToExecute as any;
          const currentLabel = current.currency ?? current.vaultName ?? current.vaultAddress?.slice(0, 10) ?? 'unknown';
          const currentAction = current.direction ?? current.action ?? 'unknown';

          emitProgress(walletAddress, executeStep, `Executing ${currentAction} ${currentLabel}...`);
          const result = await strategy.executeSignal(signalToExecute, wallet, config, strategyContext);

          if (result.success) {
            tradeCount++;
            const simTag = result.simulated ? ' [paper]' : '';
            emitProgress(walletAddress, executeStep,
              `Executed ${currentAction} ${currentLabel}${result.amountUsd ? ` ($${result.amountUsd.toFixed(2)})` : ''}${simTag}`,
            );
            // Yield deposits/withdraws get their own event types so the UI can label them correctly
            const tradeEventType: TimelineInsert['event_type'] =
              agentType === 'yield' && currentAction === 'deposit' ? 'deposit'
              : agentType === 'yield' && currentAction === 'withdraw' ? 'withdraw'
              : 'trade';

            await logTimeline(walletAddress, tradeEventType, {
              summary: `${currentAction} ${currentLabel}${result.amountUsd ? ` ($${result.amountUsd.toFixed(2)})` : ''}${simTag}`,
              detail: {
                signal: signalToExecute,
                originalSignal: signal,
                result,
                simulated: result.simulated ?? false,
                adaptationCount,
              },
              txHash: result.txHash,
              amountUsd: result.amountUsd,
              currency: agentType === 'fx' ? current.currency : undefined,
              direction: agentType === 'fx' ? (current.direction as 'buy' | 'sell') : undefined,
            }, runId, agentType);

            if (agentType === 'yield' && result.vaultAddress && result.amountUsd != null) {
              console.log(`[yield] Saving position: wallet=${walletAddress}, vault=${result.vaultAddress}, amount=$${result.amountUsd}`);
              try {
                await upsertYieldPositionAfterDeposit({
                  walletAddress,
                  serverWalletAddress: config.server_wallet_address,
                  vaultAddress: result.vaultAddress as Address,
                  amountUsd: result.amountUsd,
                  protocol: (s.vaultName ?? currentLabel ?? 'mantle-dex-v2')
                    .toLowerCase()
                    .replace(/\s+/g, '-'),
                  lpShares: result.lpShares,
                });
                console.log(`[yield] Position saved OK`);
              } catch (err) {
                console.error('[yield] Failed to save position:', err);
              }
              guardrailContext.positions.push({
                vault_address: result.vaultAddress,
                vaultAddress: result.vaultAddress,
                deposit_amount_usd: result.amountUsd,
                depositAmountUsd: result.amountUsd,
                deposited_at: new Date().toISOString(),
                depositedAt: new Date().toISOString(),
              });
            }

            if (agentType === 'yield' && currentAction === 'withdraw' && current.vaultAddress) {
              clearYieldPositionAfterWithdraw({
                walletAddress,
                vaultAddress: current.vaultAddress,
              }).catch(err => console.error('[yield] Failed to clear position:', err.message));
              const vaultKey = (current.vaultAddress as string).toLowerCase();
              guardrailContext.positions = guardrailContext.positions.filter(
                (p: any) => (p.vault_address ?? p.vaultAddress ?? '').toLowerCase() !== vaultKey,
              );
            }

            if (agentType === 'fx' && currentAction === 'buy' && result.amountUsd != null) {
              availableBuyingPowerUsd -= result.amountUsd;
              guardrailContext.availableBuyingPowerUsd = availableBuyingPowerUsd;
            }

            if (config.agent_8004_id && result.txHash) {
              submitTradeFeedback({
                serverWalletId: config.server_wallet_id,
                serverWalletAddress: config.server_wallet_address,
                agentId: BigInt(config.agent_8004_id),
                reasoning: current.reasoning ?? '',
                currency: current.currency ?? currentLabel,
                direction: currentAction,
                tradeTxHash: result.txHash,
              }).catch(err => console.error('[8004] Failed to submit reputation feedback:', err.message));
            }

            break;
          }

          const failureMessage = result.error ?? 'Unknown execution failure';
          emitProgress(walletAddress, executeStep,
            `Failed ${currentAction} ${currentLabel}: ${failureMessage}`,
          );

          const failureCat = result.failureCategory ?? 'other';
          const failureEventType =
            failureCat === 'pending_confirmation' ? 'trade_pending' :
            failureCat === 'skipped' ? 'trade_skipped' :
            'trade_failed';

          await logTimeline(walletAddress, failureEventType, {
            summary: `Execution ${failureEventType.replace('trade_', '')} for ${currentLabel}: ${formatExecutionError(failureMessage)}`,
            detail: {
              signal: signalToExecute,
              originalSignal: signal,
              error: failureMessage,
              failureCategory: failureCat,
              adaptationCount,
            },
            amountUsd: result.amountUsd,
            currency: agentType === 'fx' ? current.currency : undefined,
            direction: agentType === 'fx' ? (current.direction as 'buy' | 'sell') : undefined,
          }, runId, agentType);

          if (
            agentType !== 'fx' ||
            !baseSignal ||
            !result.failureCategory ||
            adaptationCount >= MAX_ADAPTATIONS_PER_TICK
          ) {
            break;
          }

          const adaptedPlan = evaluateAdaptedPlan(
            signalToExecute as TradeSignal,
            result.failureCategory,
            getFxRulesConfig(config, availableBuyingPowerUsd),
            watchlistCandidates,
            {
              positions: guardrailContext.positions.map((position: any) => ({
                tokenSymbol: position.token_symbol ?? position.tokenSymbol,
                balance: position.balance,
                avgEntryRate: position.avg_entry_rate ?? position.avgEntryRate ?? 0,
              })),
              portfolioValueUsd: guardrailContext.portfolioValueUsd,
              tradesToday: tradesToday + tradeCount,
              positionPrices: guardrailContext.positionPrices,
              availableBuyingPowerUsd,
            },
          );

          await logTimeline(walletAddress, 'decision_adapted', {
            summary: JSON.stringify({
              originalPlan: signalToExecute,
              reason: result.failureCategory,
              adaptedPlan,
            }),
            detail: {
              originalPlan: signalToExecute,
              reason: result.failureCategory,
              adaptedPlan,
            },
            amountUsd: adaptedPlan?.adaptedSignal.amountUsd ?? baseSignal.amountUsd,
            currency: adaptedPlan?.adaptedSignal.currency ?? baseSignal.currency,
            direction: baseSignal.direction,
          }, runId, agentType);

          if (!adaptedPlan) {
            break;
          }

          adaptationCount += 1;
          signalToExecute = adaptedPlan.adaptedSignal;
        }
      } catch (execErr) {
        emitProgress(walletAddress, executeStep,
          `Error executing ${signalLabel}: ${execErr instanceof Error ? execErr.message : 'Unknown error'}`,
        );
        await logTimeline(walletAddress, 'system', {
          summary: `Execution error for ${signalLabel}: ${formatExecutionError(execErr)}`,
          detail: { signal, error: execErr instanceof Error ? execErr.message : String(execErr) },
        }, runId, agentType);
      }
    }

    // Emit completion
    console.log(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Cycle complete: ${signals.length} signals, ${tradeCount} executed, ${blockedCount} blocked`);
    emitProgress(walletAddress, 'complete',
      `${agentType.toUpperCase()}: ${signals.length} signals, ${tradeCount} executed, ${blockedCount} blocked.`,
      { signalCount: signals.length, tradeCount, blockedCount },
    );
    await attachRunAttestationIfPossible();
  } catch (error) {
    console.error(`[agent:${walletAddress.slice(0, 8)}:${agentType}] Cycle FAILED:`, error);
    emitProgress(walletAddress, 'error',
      `Agent cycle failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { step: 'unknown', error: error instanceof Error ? error.message : String(error) },
    );
    await logTimeline(walletAddress, 'system', {
      summary: `Agent cycle failed: ${formatExecutionError(error)}`,
      detail: { error: error instanceof Error ? error.message : String(error) },
    }, runId, agentType);
    await attachRunAttestationIfPossible();
  }
}

/**
 * Insert an event into the appropriate agent timeline table.
 * Routes to fx_agent_timeline or yield_agent_timeline based on agentType.
 */
export async function logTimeline(
  walletAddress: string,
  eventType: TimelineInsert['event_type'],
  fields: {
    summary: string;
    detail?: Record<string, unknown>;
    citations?: Array<{ url: string; title: string; excerpt?: string }>;
    confidencePct?: number;
    currency?: string;
    amountUsd?: number;
    direction?: 'buy' | 'sell';
    txHash?: string;
  },
  runId?: string,
  agentType: 'fx' | 'yield' = 'fx',
): Promise<void> {
  const tableName = agentType === 'yield' ? 'yield_agent_timeline' : 'fx_agent_timeline';

  const baseRow: TimelineInsert = {
    wallet_address: walletAddress,
    event_type: eventType,
    summary: fields.summary,
    detail: (fields.detail ?? {}) as unknown as TimelineInsert['detail'],
    citations: (fields.citations ?? []) as unknown as TimelineInsert['citations'],
    confidence_pct: fields.confidencePct ?? null,
    currency: fields.currency ?? null,
    amount_usd: fields.amountUsd ?? null,
    direction: fields.direction ?? null,
    tx_hash: fields.txHash ?? null,
  };

  const rowWithRunId = runId ? { ...baseRow, run_id: runId } as TimelineInsert : baseRow;

  const { error } = await supabaseAdmin.from(tableName).insert(rowWithRunId);

  if (error) {
    console.error(`Failed to log timeline event to ${tableName}:`, error);
  }
}

/**
 * Read on-chain ERC-20 balances for the agent wallet on Mantle.
 */
async function getOnChainBalances(serverWalletAddress: string): Promise<WalletBalance[]> {
  if (!serverWalletAddress) return [];
  try {
    const duneBalances = await getWalletBalances(serverWalletAddress);
    return duneBalances.map(b => ({
      symbol: b.symbol,
      balance: BigInt(b.amount),
      formatted: String(Number(b.amount) / 10 ** b.decimals),
      valueUsd: b.value_usd,
    }));
  } catch {
    return [];
  }
}

/**
 * Get count of trades made today for a given wallet.
 * Throws on database error so callers know guardrails can't be checked.
 */
export async function getTradeCountToday(walletAddress: string, agentType: 'fx' | 'yield' = 'fx'): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const tableName = agentType === 'yield' ? 'yield_agent_timeline' : 'fx_agent_timeline';

  const { count, error } = await supabaseAdmin
    .from(tableName)
    .select('*', { count: 'exact', head: true })
    .eq('wallet_address', walletAddress)
    .eq('event_type', 'trade' as TimelineInsert['event_type'])
    .gte('created_at', todayStart.toISOString());

  if (error) {
    throw new Error(`Failed to count trades today: ${error.message}`);
  }

  return count ?? 0;
}
