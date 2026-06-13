import { createSupabaseAdmin, type Database } from "@mantleagents/db";
import {
	DEFAULT_YIELD_GUARDRAILS,
	frequencyToMs,
	parseFrequencyToMs,
	type RiskProfile,
} from "@mantleagents/shared";
import type { FastifyInstance } from "fastify";
import { chainClient } from "../lib/chain-client.js";
import { createServerWallet } from "../lib/thirdweb-wallet.js";
import { authMiddleware } from "../middleware/auth.js";
import { runAgentCycle } from "../services/agent-cron.js";
import {
	getAgentReputation,
	registerAgentOnChain,
} from "../services/agent-registry.js";
import {
	getAttestationById,
	getLatestAttestationSummary,
	listAttestations,
} from "../services/attestation-service.js";
import { convertWalletToUsdc } from "../services/convert-to-usdc.js";
import { getWalletBalances } from "../services/dune-balances.js";
import {
	fetchClaimableRewards,
	fetchYieldOpportunities,
} from "../services/merkl-client.js";
import { IchiVaultAdapter } from "../services/vault-adapters/ichi.js";
import { executeYieldWithdraw } from "../services/yield-executor.js";
import {
	clearYieldPositionAfterWithdraw,
	fullSyncYieldPositionsFromChain,
	syncYieldPositionsFromChain,
} from "../services/yield-position-tracker.js";

type AgentConfigRow = Database["public"]["Tables"]["agent_configs"]["Row"];
type AgentTimelineRow = Database["public"]["Tables"]["agent_timeline"]["Row"];

const supabaseAdmin = createSupabaseAdmin(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function yieldAgentRoutes(app: FastifyInstance) {
	// GET /api/yield-agent/status
	app.get(
		"/api/yield-agent/status",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data, error } = await supabaseAdmin
				.from("agent_configs")
				.select("*")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			const config = data as AgentConfigRow | null;

			if (error || !config) {
				return reply.status(404).send({ error: "Yield agent not configured" });
			}

			// Count today's trades
			const todayStart = new Date();
			todayStart.setHours(0, 0, 0, 0);

			const { count: tradesToday } = await supabaseAdmin
				.from("yield_agent_timeline")
				.select("*", { count: "exact", head: true })
				.eq("wallet_address", walletAddress)
				.eq("event_type", "trade" as AgentTimelineRow["event_type"])
				.gte("created_at", todayStart.toISOString());

			// Count yield positions
			const { count: positionCount } = await supabaseAdmin
				.from("yield_positions")
				.select("*", { count: "exact", head: true })
				.eq("wallet_address", walletAddress)
				.gt("lp_shares", 0);

			return {
				config: {
					id: config.id,
					active: config.active,
					frequency: config.frequency,
					serverWalletAddress: config.server_wallet_address,
					lastRunAt: config.last_run_at,
					nextRunAt: config.next_run_at,
					agent8004Id: config.agent_8004_id,
					strategyParams: config.strategy_params,
				},
				tradesToday: tradesToday ?? 0,
				positionCount: positionCount ?? 0,
			};
		},
	);

	// GET /api/yield-agent/positions
	app.get(
		"/api/yield-agent/positions",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data, error } = await supabaseAdmin
				.from("yield_positions")
				.select("*")
				.eq("wallet_address", walletAddress)
				.gt("lp_shares", 0)
				.order("deposit_amount_usd", { ascending: false });

			if (error) {
				return reply
					.status(500)
					.send({ error: "Failed to fetch yield positions" });
			}

			return {
				positions: (data ?? []).map((p: Record<string, unknown>) => ({
					id: p.id,
					vaultAddress: p.vault_address,
					protocol: p.protocol,
					lpShares: p.lp_shares,
					depositToken: p.deposit_token,
					depositAmountUsd: p.deposit_amount_usd,
					depositedAt: p.deposited_at,
					currentApr: p.current_apr,
					lastCheckedAt: p.last_checked_at,
				})),
			};
		},
	);

	// GET /api/yield-agent/reputation
	app.get(
		"/api/yield-agent/reputation",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("agent_8004_id")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			if (fetchError || !configData) {
				return reply.status(404).send({ error: "Yield agent not configured" });
			}

			const agent8004Id = (configData as Pick<AgentConfigRow, "agent_8004_id">)
				.agent_8004_id;

			if (agent8004Id == null) {
				return { feedbackCount: 0, summaryValue: 0, summaryDecimals: 0 };
			}

			try {
				const reputation = await getAgentReputation(BigInt(agent8004Id));
				return reputation;
			} catch (err) {
				console.error("Failed to fetch yield agent reputation:", err);
				return reply.status(500).send({ error: "Failed to fetch reputation" });
			}
		},
	);

	// GET /api/yield-agent/opportunities
	app.get(
		"/api/yield-agent/opportunities",
		{ preHandler: authMiddleware },
		async (_request, reply) => {
			try {
				const opportunities = await fetchYieldOpportunities();
				return { opportunities };
			} catch (err) {
				console.error("Failed to fetch yield opportunities:", err);
				return reply
					.status(500)
					.send({ error: "Failed to fetch yield opportunities" });
			}
		},
	);

	// GET /api/yield-agent/rewards
	app.get(
		"/api/yield-agent/rewards",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: configData, error: configError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_address")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			if (configError || !configData?.server_wallet_address) {
				return reply
					.status(404)
					.send({ error: "Yield agent wallet not configured" });
			}

			try {
				const rewards = await fetchClaimableRewards(
					configData.server_wallet_address,
				);
				return { rewards };
			} catch (err) {
				console.error("Failed to fetch claimable rewards:", err);
				return reply.status(500).send({ error: "Failed to fetch rewards" });
			}
		},
	);

	// POST /api/yield-agent/register
	app.post(
		"/api/yield-agent/register",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const body = request.body as {
				riskProfile: string;
				frequency: number;
				autoCompound: boolean;
			};

			if (
				!body.riskProfile ||
				!["conservative", "moderate", "aggressive"].includes(body.riskProfile)
			) {
				return reply
					.status(400)
					.send({
						error:
							"Invalid riskProfile. Must be conservative, moderate, or aggressive.",
					});
			}

			if (
				!body.frequency ||
				typeof body.frequency !== "number" ||
				body.frequency < 1 ||
				body.frequency > 24
			) {
				return reply
					.status(400)
					.send({ error: "frequency must be a number between 1 and 24" });
			}

			// Check if yield agent already exists
			const { data: existing } = await supabaseAdmin
				.from("agent_configs")
				.select("id")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			if (existing) {
				return reply
					.status(409)
					.send({ error: "Yield agent already registered" });
			}

			// Create a separate server wallet for yield agent (thirdweb)
			const identifier = `agent-yield-${walletAddress.toLowerCase()}`;
			let walletResult: { address: string };
			try {
				walletResult = await createServerWallet(identifier);
			} catch (err) {
				console.error("Failed to create yield agent wallet:", err);
				return reply
					.status(500)
					.send({ error: "Failed to create agent wallet" });
			}

			// Build default guardrails from risk profile
			const riskProfile = body.riskProfile as RiskProfile;
			const guardrails = DEFAULT_YIELD_GUARDRAILS[riskProfile];
			const strategyParams = {
				...guardrails,
				autoCompound: body.autoCompound ?? guardrails.autoCompound,
			};

			const freqMs = frequencyToMs(body.frequency);
			const nextRunAt = new Date(Date.now() + freqMs).toISOString();

			const { data: configData, error: insertError } = await supabaseAdmin
				.from("agent_configs")
				.insert({
					wallet_address: walletAddress,
					agent_type: "yield",
					active: false,
					frequency: String(body.frequency),
					server_wallet_id: identifier,
					server_wallet_address: walletResult.address,
					strategy_params: strategyParams,
					next_run_at: nextRunAt,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				})
				.select("id")
				.single();

			if (insertError || !configData) {
				console.error("Failed to insert yield agent config:", insertError);
				return reply
					.status(500)
					.send({ error: "Failed to create yield agent" });
			}

			return {
				serverWalletAddress: walletResult.address,
				configId: configData.id,
			};
		},
	);

	// POST /api/yield-agent/toggle
	app.post(
		"/api/yield-agent/toggle",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			// Get current state
			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("id, active, frequency, next_run_at, agent_8004_id")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			const config = configData as Pick<
				AgentConfigRow,
				"id" | "active" | "frequency" | "next_run_at" | "agent_8004_id"
			> | null;

			if (fetchError || !config) {
				return reply.status(404).send({ error: "Yield agent not configured" });
			}

			const newActive = !config.active;

			// Require ERC-8004 registration before activation
			if (newActive && config.agent_8004_id == null) {
				return reply.status(403).send({
					error: "Agent must be registered on ERC-8004 before activation",
					code: "NOT_REGISTERED",
				});
			}

			const updates: Record<string, unknown> = {
				active: newActive,
				updated_at: new Date().toISOString(),
			};

			// When activating, only set next_run_at if there isn't a valid future one
			if (newActive) {
				const existingNextRun = config.next_run_at
					? new Date(config.next_run_at).getTime()
					: 0;
				const hasValidFutureRun = existingNextRun > Date.now();

				if (!hasValidFutureRun) {
					const freqMs = parseFrequencyToMs(config.frequency);
					updates.next_run_at = new Date(Date.now() + freqMs).toISOString();
				}
			}

			const { error } = await supabaseAdmin
				.from("agent_configs")
				.update(updates as any)
				.eq("id", config.id);

			if (error) {
				return reply
					.status(500)
					.send({ error: "Failed to toggle yield agent" });
			}

			return { active: newActive };
		},
	);

	// POST /api/yield-agent/run-now — trigger an immediate yield agent cycle
	app.post(
		"/api/yield-agent/run-now",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("*")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			const config = configData as AgentConfigRow | null;

			if (fetchError || !config) {
				return reply.status(404).send({ error: "Yield agent not configured" });
			}

			if (!config.server_wallet_address || !config.server_wallet_id) {
				return reply
					.status(400)
					.send({ error: "Yield agent wallet not set up" });
			}

			// Sync positions from chain first so we use accurate data (clears stale rows if user withdrew manually)
			await syncYieldPositionsFromChain({
				walletAddress,
				serverWalletAddress: config.server_wallet_address,
			});

			const MIN_BALANCE_USD = 0.1;
			try {
				const balances = await getWalletBalances(config.server_wallet_address);
				const liquidValue = balances.reduce((s, b) => s + b.value_usd, 0);
				const { data: yieldPositions } = await supabaseAdmin
					.from("yield_positions")
					.select("deposit_amount_usd")
					.eq("wallet_address", walletAddress)
					.gt("lp_shares", 0);
				const vaultValue = (yieldPositions ?? []).reduce(
					(s, p) => s + Number(p.deposit_amount_usd ?? 0),
					0,
				);
				const totalValueUsd = liquidValue + vaultValue;
				if (totalValueUsd < MIN_BALANCE_USD) {
					return reply.status(400).send({
						error: "Minimum balance of $0.10 required to run the agent",
						code: "INSUFFICIENT_BALANCE",
					});
				}
			} catch (balanceErr) {
				console.error("Failed to check balance for run-now:", balanceErr);
				return reply
					.status(500)
					.send({ error: "Failed to verify wallet balance" });
			}

			// Run the cycle in background — respond immediately
			runAgentCycle(config).catch((err) => {
				console.error(
					`On-demand yield agent cycle failed for ${walletAddress}:`,
					err,
				);
			});

			// Update last_run_at and next_run_at
			const freqMs = parseFrequencyToMs(config.frequency);
			const nextRun = new Date(Date.now() + freqMs).toISOString();

			await supabaseAdmin
				.from("agent_configs")
				.update({
					last_run_at: new Date().toISOString(),
					next_run_at: nextRun,
					updated_at: new Date().toISOString(),
				})
				.eq("id", config.id);

			return { triggered: true };
		},
	);

	// POST /api/yield-agent/sync-positions — discover on-chain positions and backfill yield_positions
	app.post(
		"/api/yield-agent/sync-positions",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: configData, error: configError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_address")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			if (configError || !configData?.server_wallet_address) {
				return reply
					.status(404)
					.send({ error: "Yield agent wallet not configured" });
			}

			const opportunities = await fetchYieldOpportunities();
			const { synced, cleared } = await fullSyncYieldPositionsFromChain({
				walletAddress,
				serverWalletAddress: configData.server_wallet_address,
				opportunities,
			});

			return { synced, cleared, message: "Positions synced from chain" };
		},
	);

	// POST /api/yield-agent/withdraw-all — full exit from all vault positions
	app.post(
		"/api/yield-agent/withdraw-all",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			// Get yield agent config
			const { data: configData, error: configError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_id, server_wallet_address")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			const config = configData as Pick<
				AgentConfigRow,
				"server_wallet_id" | "server_wallet_address"
			> | null;

			if (
				configError ||
				!config ||
				!config.server_wallet_id ||
				!config.server_wallet_address
			) {
				return reply
					.status(404)
					.send({ error: "Yield agent wallet not configured" });
			}

			// Get all positions with lp_shares > 0
			const { data: positions, error: posError } = await supabaseAdmin
				.from("yield_positions")
				.select("vault_address, protocol")
				.eq("wallet_address", walletAddress)
				.gt("lp_shares", 0);

			if (posError) {
				return reply.status(500).send({ error: "Failed to fetch positions" });
			}

			if (!positions || positions.length === 0) {
				return { results: [], message: "No active positions to withdraw" };
			}

			const ichiAdapter = new IchiVaultAdapter();
			const publicClient = chainClient as import("viem").PublicClient;

			// Execute withdrawal for each position
			const results = [];
			for (const pos of positions) {
				const vaultAddress = pos.vault_address as `0x${string}`;
				const proto = (pos.protocol ?? '').toLowerCase();
				try {
					// Only verify on-chain for Ichi vaults; CLAMM positions are DB-only
					if (proto.includes('ichi')) {
						const onChainPosition = await ichiAdapter.getPosition(
							vaultAddress,
							config.server_wallet_address as `0x${string}`,
							publicClient,
						);
						if (onChainPosition.lpShares === 0n) {
							await clearYieldPositionAfterWithdraw({
								walletAddress,
								vaultAddress: pos.vault_address,
							});
							results.push({
								vaultAddress,
								txHash: null,
								success: true,
								skipped: true,
								message: "No on-chain position; cleared stale DB row",
							});
							continue;
						}
					}

					const result = await executeYieldWithdraw({
						serverWalletId: config.server_wallet_id,
						serverWalletAddress: config.server_wallet_address,
						vaultAddress,
					});
					if (result.success) {
						await clearYieldPositionAfterWithdraw({
							walletAddress,
							vaultAddress: pos.vault_address,
						});
					}
					results.push({
						vaultAddress,
						txHash: result.txHash ?? null,
						success: result.success,
						error: result.error ?? null,
						skipped: false,
					});
				} catch (err) {
					results.push({
						vaultAddress,
						txHash: null,
						success: false,
						error: err instanceof Error ? err.message : String(err),
						skipped: false,
					});
				}
			}

			// Convert all withdrawn tokens (USDT, WETH, etc.) to USDC so user ends with USDC
			const anyWithdrawn = results.some((r) => r.success && !r.skipped);
			let convertResult:
				| {
						swapped: Array<{ symbol: string; amount: string; txHash: string }>;
						skipped: Array<{ symbol: string; reason: string }>;
				  }
				| undefined;
			if (anyWithdrawn) {
				try {
					convertResult = await convertWalletToUsdc({
						serverWalletId: config.server_wallet_id,
						serverWalletAddress: config.server_wallet_address,
					});
				} catch (err) {
					console.error("Convert to USDC after withdraw failed:", err);
					convertResult = {
						swapped: [],
						skipped: [
							{
								symbol: "all",
								reason: err instanceof Error ? err.message : "Convert failed",
							},
						],
					};
				}
			}

			return { results, convertResult };
		},
	);

	// POST /api/yield-agent/convert-to-usdc — swap all convertible tokens to USDC
	app.post(
		"/api/yield-agent/convert-to-usdc",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: configData, error: configError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_id, server_wallet_address")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			const config = configData as Pick<
				AgentConfigRow,
				"server_wallet_id" | "server_wallet_address"
			> | null;

			if (
				configError ||
				!config ||
				!config.server_wallet_id ||
				!config.server_wallet_address
			) {
				return reply
					.status(404)
					.send({ error: "Yield agent wallet not configured" });
			}

			try {
				const result = await convertWalletToUsdc({
					serverWalletId: config.server_wallet_id,
					serverWalletAddress: config.server_wallet_address,
				});
				return result;
			} catch (err) {
				console.error("Convert to USDC failed:", err);
				return reply.status(500).send({
					error:
						err instanceof Error ? err.message : "Failed to convert to USDC",
				});
			}
		},
	);

	// PUT /api/yield-agent/settings
	app.put(
		"/api/yield-agent/settings",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const body = request.body as {
				frequency?: number;
				minAprThreshold?: number;
				maxSingleVaultPct?: number;
				minHoldPeriodDays?: number;
				maxIlTolerancePct?: number;
				minTvlUsd?: number;
				maxVaultCount?: number;
				rewardClaimFrequencyHrs?: number;
				autoCompound?: boolean;
				customPrompt?: string;
			};

			// Validate frequency (1–24 integer hours)
			if (body.frequency !== undefined) {
				if (
					typeof body.frequency !== "number" ||
					!Number.isInteger(body.frequency) ||
					body.frequency < 1 ||
					body.frequency > 24
				) {
					return reply
						.status(400)
						.send({ error: "frequency must be an integer between 1 and 24" });
				}
			}

			// Validate numeric ranges
			if (body.minAprThreshold !== undefined && body.minAprThreshold < 0) {
				return reply
					.status(400)
					.send({ error: "minAprThreshold must be non-negative" });
			}
			if (
				body.maxSingleVaultPct !== undefined &&
				(body.maxSingleVaultPct <= 0 || body.maxSingleVaultPct > 100)
			) {
				return reply
					.status(400)
					.send({ error: "maxSingleVaultPct must be between 0 and 100" });
			}
			if (body.minHoldPeriodDays !== undefined && body.minHoldPeriodDays < 0) {
				return reply
					.status(400)
					.send({ error: "minHoldPeriodDays must be non-negative" });
			}
			if (
				body.maxIlTolerancePct !== undefined &&
				(body.maxIlTolerancePct <= 0 || body.maxIlTolerancePct > 100)
			) {
				return reply
					.status(400)
					.send({ error: "maxIlTolerancePct must be between 0 and 100" });
			}
			if (body.minTvlUsd !== undefined && body.minTvlUsd < 0) {
				return reply
					.status(400)
					.send({ error: "minTvlUsd must be non-negative" });
			}
			if (
				body.maxVaultCount !== undefined &&
				(!Number.isInteger(body.maxVaultCount) || body.maxVaultCount < 1)
			) {
				return reply
					.status(400)
					.send({ error: "maxVaultCount must be a positive integer" });
			}
			if (
				body.rewardClaimFrequencyHrs !== undefined &&
				body.rewardClaimFrequencyHrs < 1
			) {
				return reply
					.status(400)
					.send({ error: "rewardClaimFrequencyHrs must be at least 1" });
			}

			// Get current config to merge strategy_params
			const { data: currentConfig, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("id, strategy_params")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			if (fetchError || !currentConfig) {
				return reply.status(404).send({ error: "Yield agent not configured" });
			}

			const existingParams = (currentConfig.strategy_params ?? {}) as Record<
				string,
				unknown
			>;

			// Build updated strategy_params
			const strategyUpdates: Record<string, unknown> = { ...existingParams };
			if (body.minAprThreshold !== undefined)
				strategyUpdates.minAprThreshold = body.minAprThreshold;
			if (body.maxSingleVaultPct !== undefined)
				strategyUpdates.maxSingleVaultPct = body.maxSingleVaultPct;
			if (body.minHoldPeriodDays !== undefined)
				strategyUpdates.minHoldPeriodDays = body.minHoldPeriodDays;
			if (body.maxIlTolerancePct !== undefined)
				strategyUpdates.maxIlTolerancePct = body.maxIlTolerancePct;
			if (body.minTvlUsd !== undefined)
				strategyUpdates.minTvlUsd = body.minTvlUsd;
			if (body.maxVaultCount !== undefined)
				strategyUpdates.maxVaultCount = body.maxVaultCount;
			if (body.rewardClaimFrequencyHrs !== undefined)
				strategyUpdates.rewardClaimFrequencyHrs = body.rewardClaimFrequencyHrs;
			if (body.autoCompound !== undefined)
				strategyUpdates.autoCompound = body.autoCompound;

			// Build column-level updates
			const updates: Record<string, unknown> = {
				strategy_params: strategyUpdates,
				updated_at: new Date().toISOString(),
			};

			if (body.frequency !== undefined) updates.frequency = body.frequency;
			if (body.customPrompt !== undefined)
				updates.custom_prompt = body.customPrompt;

			const { data, error } = await supabaseAdmin
				.from("agent_configs")
				.update(updates as any)
				.eq("id", currentConfig.id)
				.select()
				.single();

			if (error || !data) {
				return reply
					.status(500)
					.send({ error: "Failed to update yield agent settings" });
			}

			return { success: true };
		},
	);

	// POST /api/yield-agent/register-8004 — sponsored on-chain registration for yield agent
	app.post(
		"/api/yield-agent/register-8004",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			// Check if already registered
			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_id, server_wallet_address, agent_8004_id")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "yield")
				.single();

			const config = configData as Pick<
				AgentConfigRow,
				"server_wallet_id" | "server_wallet_address" | "agent_8004_id"
			> | null;

			if (fetchError || !config) {
				return reply
					.status(404)
					.send({
						error: "Yield agent not configured. Complete registration first.",
					});
			}

			if (config.agent_8004_id != null) {
				return reply
					.status(409)
					.send({
						error: "Yield agent is already registered on ERC-8004",
						agentId: config.agent_8004_id,
					});
			}

			if (!config.server_wallet_id || !config.server_wallet_address) {
				return reply.status(400).send({ error: "Server wallet not set up" });
			}

			const port = process.env.PORT || "4000";
			const apiBase = process.env.API_PUBLIC_URL || `http://localhost:${port}`;
			const metadataUrl = `${apiBase}/api/yield-agent/${walletAddress}/8004-metadata`;

			try {
				const result = await registerAgentOnChain({
					userWalletAddress: walletAddress,
					serverWalletId: config.server_wallet_id,
					serverWalletAddress: config.server_wallet_address,
					metadataUrl,
				});

				// Save to DB
				await supabaseAdmin
					.from("agent_configs")
					.update({
						agent_8004_id: Number(result.agentId),
						agent_8004_tx_hash: result.registerTxHash,
						updated_at: new Date().toISOString(),
					})
					.eq("wallet_address", walletAddress)
					.eq("agent_type", "yield");

				return {
					success: true,
					agentId: Number(result.agentId),
					registerTxHash: result.registerTxHash,
					linkTxHash: result.linkTxHash,
				};
			} catch (err: any) {
				console.error("[8004] Yield agent sponsored registration failed:", err);
				return reply.status(500).send({
					error: "Registration failed. Please try again.",
					detail: err?.message,
				});
			}
		},
	);

	// GET /api/yield-agent/:walletAddress/8004-metadata — public endpoint (no auth)
	app.get(
		"/api/yield-agent/:walletAddress/8004-metadata",
		async (request, reply) => {
			const { walletAddress } = request.params as { walletAddress: string };

			const [profileResult, configResult] = await Promise.all([
				supabaseAdmin
					.from("user_profiles")
					.select("display_name")
					.eq("wallet_address", walletAddress)
					.single(),
				supabaseAdmin
					.from("agent_configs")
					.select("active")
					.eq("wallet_address", walletAddress)
					.eq("agent_type", "yield")
					.single(),
			]);

			if (configResult.error || !configResult.data) {
				return reply.status(404).send({ error: "Yield agent not found" });
			}

			const displayName =
				profileResult.data?.display_name ?? walletAddress.slice(0, 8);
			const agentConfig = configResult.data as Pick<AgentConfigRow, "active">;
			const agentName = `MantleAgents-Yield-${displayName.replace(/\s+/g, "-")}`;
			const teeSummary = await getLatestAttestationSummary({
				walletAddress,
				agentType: "yield",
			});
			const nowUnix = Math.floor(Date.now() / 1000);

			return {
				type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
				name: agentName,
				description:
					"MantleAgents runs autonomous AI agents that read the news, hunt yield, rebalance your portfolio, and execute on-chain — while you touch grass. No Bloomberg terminal. No gas fees. No babysitting.",
				image: "https://mantleagents.co/mantleagents.png",
				services: [
					{
						name: "web",
						endpoint: "https://mantleagents.co",
						description: "Website",
					},
					{
						name: "github",
						endpoint: "https://github.com/0xkemcho/MantleAgents",
						description: "Source Code",
					},
					{
						name: "attestations",
						endpoint: `${process.env.PUBLIC_API_BASE_URL || "https://api.mantleagents.co"}/api/yield-agent/attestations`,
						description: "Run attestations (TEE-ready interface)",
					},
				],
				supportedTrust: ["reputation", "tee-attestation"],
				updatedAt: nowUnix,
				attributes: {
					tee: {
						mode: "attested",
						status: teeSummary.status,
						attestationType: "hmac-sha256",
						latestAttestationAt: teeSummary.latestAttestationAt,
						attestationEndpoint: `${process.env.PUBLIC_API_BASE_URL || "https://api.mantleagents.co"}/api/yield-agent/attestations`,
					},
				},
				x402Support: false,
				active: agentConfig.active,
			};
		},
	);

	// GET /api/yield-agent/attestations
	app.get(
		"/api/yield-agent/attestations",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const query = request.query as { limit?: string; offset?: string };
			const limit = Math.min(
				100,
				Math.max(1, parseInt(query.limit || "20", 10)),
			);
			const offset = Math.max(0, parseInt(query.offset || "0", 10));

			try {
				return await listAttestations({
					walletAddress,
					agentType: "yield",
					limit,
					offset,
				});
			} catch (error) {
				console.error("Failed to list Yield attestations:", error);
				return reply
					.status(500)
					.send({ error: "Failed to fetch attestations" });
			}
		},
	);

	// GET /api/yield-agent/attestations/:id
	app.get(
		"/api/yield-agent/attestations/:id",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const { id } = request.params as { id: string };

			try {
				const attestation = await getAttestationById({
					walletAddress,
					agentType: "yield",
					id,
				});
				if (!attestation)
					return reply.status(404).send({ error: "Attestation not found" });
				return attestation;
			} catch (error) {
				console.error("Failed to fetch Yield attestation:", error);
				return reply.status(500).send({ error: "Failed to fetch attestation" });
			}
		},
	);

	// GET /api/yield-agent/timeline
	app.get(
		"/api/yield-agent/timeline",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const query = request.query as {
				type?: string;
				limit?: string;
				offset?: string;
			};

			const limit = Math.min(
				100,
				Math.max(1, parseInt(query.limit || "20", 10)),
			);
			const offset = Math.max(0, parseInt(query.offset || "0", 10));

			let dbQuery = supabaseAdmin
				.from("yield_agent_timeline")
				.select("*", { count: "exact" })
				.eq("wallet_address", walletAddress)
				.order("created_at", { ascending: false })
				.range(offset, offset + limit - 1);

			if (query.type) {
				dbQuery = dbQuery.eq(
					"event_type",
					query.type as AgentTimelineRow["event_type"],
				);
			}

			const { data, error, count } = await dbQuery;

			if (error) {
				return reply.status(500).send({ error: "Failed to fetch timeline" });
			}

			return {
				entries: (data ?? []).map(mapTimelineEntry),
				total: count ?? 0,
				hasMore: offset + limit < (count ?? 0),
			};
		},
	);
}

/** Map a raw DB row to a camelCase timeline entry. */
function mapTimelineEntry(row: Record<string, unknown>) {
	const rawAttestationStatus = String(row.attestation_status ?? "missing");
	const attestationStatus =
		rawAttestationStatus === "verified" ||
		rawAttestationStatus === "mock_verified"
			? "verified"
			: rawAttestationStatus === "invalid" ||
					rawAttestationStatus === "mock_invalid"
				? "invalid"
				: "missing";

	return {
		id: row.id,
		eventType: row.event_type,
		summary: row.summary,
		detail: row.detail,
		citations: row.citations,
		confidencePct: row.confidence_pct,
		currency: row.currency,
		amountUsd: row.amount_usd,
		direction: row.direction,
		txHash: row.tx_hash,
		runId: row.run_id ?? null,
		attestationId: row.attestation_id ?? null,
		attestationStatus,
		createdAt: row.created_at,
	};
}
