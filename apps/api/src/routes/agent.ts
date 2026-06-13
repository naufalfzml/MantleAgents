import { createSupabaseAdmin, type Database } from "@mantleagents/db";
import {
	type AgentFrequency,
	COMMODITY_TOKENS,
	STABLE_TOKENS,
	parseFrequencyToMs,
} from "@mantleagents/shared";
import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { runAgentCycle } from "../services/agent-cron.js";
import {
	getAgentReputation,
	prepareAgentWalletLink,
	registerAgentOnChain,
} from "../services/agent-registry.js";
import {
	getAttestationById,
	getLatestAttestationSummary,
	listAttestations,
} from "../services/attestation-service.js";
import { getWalletBalances } from "../services/dune-balances.js";

type AgentConfigRow = Database["public"]["Tables"]["agent_configs"]["Row"];
type AgentTimelineRow = Database["public"]["Tables"]["agent_timeline"]["Row"];
type AgentPositionRow = Database["public"]["Tables"]["agent_positions"]["Row"];

const supabaseAdmin = createSupabaseAdmin(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function agentRoutes(app: FastifyInstance) {
	// GET /api/agent/status
	app.get(
		"/api/agent/status",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data, error } = await supabaseAdmin
				.from("agent_configs")
				.select("*")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "fx")
				.single();

			const config = data as AgentConfigRow | null;

			if (error || !config) {
				return reply.status(404).send({ error: "Agent not configured" });
			}

			// Count today's trades
			const todayStart = new Date();
			todayStart.setHours(0, 0, 0, 0);

			const { count: tradesToday } = await supabaseAdmin
				.from("fx_agent_timeline")
				.select("*", { count: "exact", head: true })
				.eq("wallet_address", walletAddress)
				.eq("event_type", "trade" as AgentTimelineRow["event_type"])
				.gte("created_at", todayStart.toISOString());

			// Count positions
			const { count: positionCount } = await supabaseAdmin
				.from("agent_positions")
				.select("*", { count: "exact", head: true })
				.eq("wallet_address", walletAddress)
				.gt("balance", 0);

			return {
				config: {
					id: config.id,
					active: config.active,
					frequency: config.frequency,
					maxTradeSizePct: config.max_trade_size_pct,
					maxAllocationPct: config.max_allocation_pct,
					stopLossPct: config.stop_loss_pct,
					dailyTradeLimit: config.daily_trade_limit,
					allowedCurrencies: config.allowed_currencies,
					blockedCurrencies: config.blocked_currencies,
					customPrompt: config.custom_prompt,
					serverWalletAddress: config.server_wallet_address,
					lastRunAt: config.last_run_at,
					nextRunAt: config.next_run_at,
					agent8004Id: config.agent_8004_id,
				},
				tradesToday: tradesToday ?? 0,
				positionCount: positionCount ?? 0,
			};
		},
	);

	// POST /api/agent/toggle
	app.post(
		"/api/agent/toggle",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			// Get current state
			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("id, active, frequency, next_run_at, agent_8004_id")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "fx")
				.single();

			const config = configData as Pick<
				AgentConfigRow,
				"id" | "active" | "frequency" | "next_run_at" | "agent_8004_id"
			> | null;

			if (fetchError || !config) {
				return reply.status(404).send({ error: "Agent not configured" });
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
				return reply.status(500).send({ error: "Failed to toggle agent" });
			}

			return { active: newActive };
		},
	);

	// POST /api/agent/run-now — trigger an immediate agent cycle
	app.post(
		"/api/agent/run-now",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("*")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "fx")
				.single();

			const config = configData as AgentConfigRow | null;

			if (fetchError || !config) {
				return reply.status(404).send({ error: "Agent not configured" });
			}

			if (!config.server_wallet_address || !config.server_wallet_id) {
				return reply.status(400).send({ error: "Agent wallet not set up" });
			}

			// Run the cycle in background — respond immediately
			runAgentCycle(config).catch((err) => {
				console.error(
					`On-demand agent cycle failed for ${walletAddress}:`,
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

	// GET /api/agent/timeline
	app.get(
		"/api/agent/timeline",
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
				.from("fx_agent_timeline")
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

	// GET /api/agent/timeline/:id
	app.get(
		"/api/agent/timeline/:id",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const { id } = request.params as { id: string };

			const { data, error } = await supabaseAdmin
				.from("fx_agent_timeline")
				.select("*")
				.eq("id", id)
				.eq("wallet_address", walletAddress)
				.single();

			if (error || !data) {
				return reply.status(404).send({ error: "Timeline entry not found" });
			}

			return mapTimelineEntry(data);
		},
	);

	// GET /api/agent/attestations
	app.get(
		"/api/agent/attestations",
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
					agentType: "fx",
					limit,
					offset,
				});
			} catch (error) {
				console.error("Failed to list FX attestations:", error);
				return reply
					.status(500)
					.send({ error: "Failed to fetch attestations" });
			}
		},
	);

	// GET /api/agent/attestations/:id
	app.get(
		"/api/agent/attestations/:id",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const { id } = request.params as { id: string };

			try {
				const attestation = await getAttestationById({
					walletAddress,
					agentType: "fx",
					id,
				});
				if (!attestation)
					return reply.status(404).send({ error: "Attestation not found" });
				return attestation;
			} catch (error) {
				console.error("Failed to fetch FX attestation:", error);
				return reply.status(500).send({ error: "Failed to fetch attestation" });
			}
		},
	);

	// PUT /api/agent/settings
	app.put(
		"/api/agent/settings",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const body = request.body as {
				frequency?: AgentFrequency;
				maxTradeSizePct?: number;
				maxAllocationPct?: number;
				stopLossPct?: number;
				dailyTradeLimit?: number;
				allowedCurrencies?: string[];
				blockedCurrencies?: string[];
				customPrompt?: string;
			};

			// Validate currencies against known token universe
			const validCurrencies = new Set<string>([
				...STABLE_TOKENS,
				...COMMODITY_TOKENS,
			]);
			if (body.allowedCurrencies) {
				const invalid = body.allowedCurrencies.filter(
					(c) => !validCurrencies.has(c),
				);
				if (invalid.length > 0) {
					return reply
						.status(400)
						.send({
							error: `Unknown currencies in allowedCurrencies: ${invalid.join(", ")}`,
						});
				}
			}
			if (body.blockedCurrencies) {
				const invalid = body.blockedCurrencies.filter(
					(c) => !validCurrencies.has(c),
				);
				if (invalid.length > 0) {
					return reply
						.status(400)
						.send({
							error: `Unknown currencies in blockedCurrencies: ${invalid.join(", ")}`,
						});
				}
			}

			// Validate frequency (1–24 integer hours). Accept number or numeric string.
			let validatedFrequency: number | undefined;
			if (body.frequency !== undefined) {
				const freq =
					typeof body.frequency === "number"
						? body.frequency
						: parseInt(String(body.frequency), 10);
				if (
					Number.isNaN(freq) ||
					!Number.isInteger(freq) ||
					freq < 1 ||
					freq > 24
				) {
					return reply
						.status(400)
						.send({ error: "frequency must be an integer between 1 and 24" });
				}
				validatedFrequency = freq;
			}

			// Validate max trade size % (1-100)
			if (body.maxTradeSizePct !== undefined) {
				const pct = typeof body.maxTradeSizePct === "number"
					? body.maxTradeSizePct
					: parseInt(String(body.maxTradeSizePct), 10);
				if (Number.isNaN(pct) || pct < 1 || pct > 100) {
					return reply
						.status(400)
						.send({ error: "maxTradeSizePct must be between 1 and 100" });
				}
			}
			if (
				body.maxAllocationPct !== undefined &&
				(body.maxAllocationPct <= 0 || body.maxAllocationPct > 100)
			) {
				return reply
					.status(400)
					.send({ error: "maxAllocationPct must be between 0 and 100" });
			}
			if (
				body.stopLossPct !== undefined &&
				(body.stopLossPct <= 0 || body.stopLossPct > 100)
			) {
				return reply
					.status(400)
					.send({ error: "stopLossPct must be between 0 and 100" });
			}
			if (
				body.dailyTradeLimit !== undefined &&
				(body.dailyTradeLimit < 1 || !Number.isInteger(body.dailyTradeLimit))
			) {
				return reply
					.status(400)
					.send({ error: "dailyTradeLimit must be a positive integer" });
			}

			const updates: Record<string, unknown> = {
				updated_at: new Date().toISOString(),
			};

			if (validatedFrequency !== undefined) updates.frequency = validatedFrequency;
			if (body.maxTradeSizePct !== undefined) {
				const pct = typeof body.maxTradeSizePct === "number"
					? body.maxTradeSizePct
					: parseInt(String(body.maxTradeSizePct), 10);
				if (!Number.isNaN(pct) && pct >= 1 && pct <= 100) {
					updates.max_trade_size_pct = pct;
				}
			}
			if (body.maxAllocationPct !== undefined)
				updates.max_allocation_pct = body.maxAllocationPct;
			if (body.stopLossPct !== undefined)
				updates.stop_loss_pct = body.stopLossPct;
			if (body.dailyTradeLimit !== undefined)
				updates.daily_trade_limit = body.dailyTradeLimit;
			if (body.allowedCurrencies)
				updates.allowed_currencies = body.allowedCurrencies;
			if (body.blockedCurrencies)
				updates.blocked_currencies = body.blockedCurrencies;
			if (body.customPrompt !== undefined)
				updates.custom_prompt = body.customPrompt;

			const { data, error } = await supabaseAdmin
				.from("agent_configs")
				.update(updates as any)
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "fx")
				.select()
				.maybeSingle();

			if (error) {
				console.error("[agent/settings] Update failed:", error);
				return reply.status(500).send({
					error: "Failed to update settings",
					details: error.message,
				});
			}
			if (!data) {
				return reply.status(404).send({
					error: "FX agent not configured. Complete onboarding first.",
				});
			}

			return { success: true };
		},
	);

	// GET /api/agent/positions
	app.get(
		"/api/agent/positions",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: posData, error } = await supabaseAdmin
				.from("agent_positions")
				.select("*")
				.eq("wallet_address", walletAddress)
				.gt("balance", 0)
				.order("balance", { ascending: false });

			if (error) {
				return reply.status(500).send({ error: "Failed to fetch positions" });
			}

			const positions = (posData ?? []) as AgentPositionRow[];

			return {
				positions: positions.map((p) => ({
					id: p.id,
					tokenSymbol: p.token_symbol,
					tokenAddress: p.token_address,
					balance: p.balance,
					avgEntryRate: p.avg_entry_rate,
					updatedAt: p.updated_at,
				})),
			};
		},
	);

	// GET /api/agent/debug-merkl — unauthenticated debug: see raw Merkl BSC opportunities
	app.get('/api/agent/debug-merkl', async (_request, reply) => {
		const { fetchYieldOpportunities, clearMerklCache } = await import('../services/merkl-client.js');
		clearMerklCache();
		const opps = await fetchYieldOpportunities();
		const byProtocol: Record<string, number> = {};
		for (const o of opps) {
			const key = `${o.protocol}(type=${o.type})`;
			byProtocol[key] = (byProtocol[key] ?? 0) + 1;
		}
		const ichiOnly = opps.filter(o => o.type?.toLowerCase() === 'ichi' || o.protocol?.toLowerCase().includes('ichi'));
		return reply.send({
			total: opps.length,
			ichiCount: ichiOnly.length,
			byProtocol,
			ichiOpportunities: ichiOnly.map(o => ({
				name: o.name, protocol: o.protocol, type: o.type,
				apr: o.apr, tvl: o.tvl, tokens: o.tokens?.map(t => t.symbol),
				vaultAddress: o.vaultAddress,
			})),
			allSample: opps.slice(0, 20).map(o => ({
				name: o.name, protocol: o.protocol, type: o.type, apr: o.apr, tvl: o.tvl,
			})),
		});
	});

	// GET /api/agent/portfolio
	// Query param: agent_type=fx|yield (default: fx)
	app.get(
		"/api/agent/portfolio",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const agentType =
				(request.query as { agent_type?: string })?.agent_type ?? "fx";
			const validType = agentType === "yield" ? "yield" : "fx";

			// Look up the server wallet address for on-chain balance query
			const { data: configData, error: configError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_address")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", validType)
				.single();

			if (configError || !configData?.server_wallet_address) {
				// Return empty portfolio instead of 404 — navbar fetches both fx+yield on every page
				return reply.send({
					totalValueUsd: 0, totalPnl: 0, totalPnlPct: 0,
					holdings: [], vaultPositions: [],
				});
			}

			try {
				const balances = await getWalletBalances(
					configData.server_wallet_address,
				);

				// FX: fetch avg_entry_rate from agent_positions for PnL. Yield: no position tracking.
				const entryRateMap = new Map<string, number>();
				if (validType === "fx") {
					const { data: positionsData } = await supabaseAdmin
						.from("agent_positions")
						.select("token_symbol, avg_entry_rate")
						.eq("wallet_address", walletAddress);

					if (positionsData) {
						for (const p of positionsData) {
							if (p.avg_entry_rate != null) {
								entryRateMap.set(p.token_symbol, p.avg_entry_rate);
							}
						}
					}
				}

				// Yield: include vault positions in total (matches run-now eligibility check)
				let vaultValueUsd = 0;
				const yieldPositionMap = new Map<string, number>();

				if (validType === "yield") {
					const { data: yieldPositions } = await supabaseAdmin
						.from("yield_positions")
						.select("vault_address, deposit_amount_usd")
						.eq("wallet_address", walletAddress)
						.gt("lp_shares", 0);

					if (yieldPositions) {
						for (const p of yieldPositions) {
							const val = Number(p.deposit_amount_usd ?? 0);
							vaultValueUsd += val;
							if (p.vault_address) {
								yieldPositionMap.set(p.vault_address.toLowerCase(), val);
							}
						}
					}
				}

				let totalValueUsd = vaultValueUsd;
				let totalPnl = 0;
				let hasAnyTrackedPosition = false;
				const holdings = balances.map((b) => {
					const balance = Number(b.amount) / 10 ** b.decimals;
					let valueUsd = b.value_usd || 0;

					let isYieldPosition = false;
					let yieldCostBasis: number | null = null;
					if (validType === "yield") {
						const trackedVal = yieldPositionMap.get(b.address.toLowerCase());
						if (trackedVal !== undefined) {
							isYieldPosition = true;
							yieldCostBasis = trackedVal; // deposit_amount_usd = cost basis
							// If Dune has no value, use the tracked deposit value
							if (!valueUsd) {
								valueUsd = trackedVal;
							}
						}
					}

					// Only add to totalValueUsd if it's NOT a yield position (since those are already in vaultValueUsd)
					if (!isYieldPosition) {
						totalValueUsd += valueUsd;
					}
					const avgEntryRate = entryRateMap.get(b.symbol) ?? null;
					const fxCostBasis =
						avgEntryRate != null ? avgEntryRate * balance : null;
					const costBasis = fxCostBasis ?? yieldCostBasis ?? null;
					const pnl = costBasis != null ? valueUsd - costBasis : 0;
					if (costBasis != null) hasAnyTrackedPosition = true;
					totalPnl += pnl;
					return {
						tokenSymbol: b.symbol,
						tokenAddress: b.address,
						balance,
						priceUsd: b.price_usd || 0,
						valueUsd,
						avgEntryRate,
						costBasis,
						pnl,
					};
				});

				const totalCostBasis = totalValueUsd - totalPnl;
				const totalPnlResult = hasAnyTrackedPosition ? totalPnl : null;
				const totalPnlPct =
					hasAnyTrackedPosition && totalCostBasis > 0
						? (totalPnl / totalCostBasis) * 100
						: null;

				return {
					totalValueUsd,
					totalPnl: totalPnlResult,
					totalPnlPct,
					holdings,
				};
			} catch (err) {
				console.error("Failed to fetch portfolio from Dune:", err);
				return reply.status(500).send({ error: "Failed to fetch portfolio" });
			}
		},
	);

	// POST /api/agent/register-8004 — sponsored on-chain registration (backend pays gas)
	app.post(
		"/api/agent/register-8004",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const { agent_type = "fx" } = (request.body ?? {}) as {
				agent_type?: "fx" | "yield";
			};

			// Check if already registered
			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_id, server_wallet_address, agent_8004_id")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", agent_type)
				.single();

			const config = configData as Pick<
				AgentConfigRow,
				"server_wallet_id" | "server_wallet_address" | "agent_8004_id"
			> | null;

			if (fetchError || !config) {
				return reply
					.status(404)
					.send({ error: "Agent not configured. Complete onboarding first." });
			}

			if (config.agent_8004_id != null) {
				return reply
					.status(409)
					.send({
						error: "Agent is already registered on ERC-8004",
						agentId: config.agent_8004_id,
					});
			}

			if (!config.server_wallet_id || !config.server_wallet_address) {
				return reply.status(400).send({ error: "Server wallet not set up" });
			}

			const port = process.env.PORT || "4000";
			const apiBase = process.env.API_PUBLIC_URL || `http://localhost:${port}`;
			const metadataUrl = `${apiBase}/api/agent/${walletAddress}/8004-metadata`;

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
					.eq("agent_type", agent_type);

				return {
					success: true,
					agentId: Number(result.agentId),
					registerTxHash: result.registerTxHash,
					linkTxHash: result.linkTxHash,
				};
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				const stack = err instanceof Error ? err.stack : undefined;
				console.error("[8004] Sponsored registration failed:", message);
				if (stack) console.error("[8004] Stack:", stack);
				return reply.status(500).send({
					error: "Registration failed. Please try again.",
					detail: message,
				});
			}
		},
	);

	// POST /api/agent/prepare-8004-link
	app.post(
		"/api/agent/prepare-8004-link",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const { agentId } = request.body as { agentId: number };

			if (agentId == null || typeof agentId !== "number") {
				return reply
					.status(400)
					.send({ error: "agentId is required and must be a number" });
			}

			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("server_wallet_id, server_wallet_address")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "fx")
				.single();

			const config = configData as Pick<
				AgentConfigRow,
				"server_wallet_id" | "server_wallet_address"
			> | null;

			if (
				fetchError ||
				!config ||
				!config.server_wallet_id ||
				!config.server_wallet_address
			) {
				return reply.status(404).send({ error: "Agent wallet not configured" });
			}

			try {
				const result = await prepareAgentWalletLink(
					config.server_wallet_id,
					config.server_wallet_address,
					BigInt(agentId),
					walletAddress,
				);

				return {
					signature: result.signature,
					deadline: result.deadline.toString(),
					serverWalletAddress: result.serverWalletAddress,
				};
			} catch (err) {
				console.error("Failed to prepare 8004 wallet link:", err);
				return reply
					.status(500)
					.send({ error: "Failed to prepare wallet link signature" });
			}
		},
	);

	// POST /api/agent/confirm-8004-registration
	app.post(
		"/api/agent/confirm-8004-registration",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });
			const {
				agentId,
				txHash,
				agent_type = "fx",
			} = request.body as {
				agentId: number;
				txHash: string;
				agent_type?: "fx" | "yield";
			};

			if (agentId == null || typeof agentId !== "number") {
				return reply
					.status(400)
					.send({ error: "agentId is required and must be a number" });
			}
			if (!txHash || typeof txHash !== "string") {
				return reply.status(400).send({ error: "txHash is required" });
			}

			const { error } = await supabaseAdmin
				.from("agent_configs")
				.update({
					agent_8004_id: agentId,
					agent_8004_tx_hash: txHash,
					updated_at: new Date().toISOString(),
				})
				.eq("wallet_address", walletAddress)
				.eq("agent_type", agent_type);

			if (error) {
				console.error("Failed to confirm 8004 registration:", error);
				return reply.status(500).send({ error: "Failed to save registration" });
			}

			return { success: true, agentId };
		},
	);

	// GET /api/agent/reputation
	app.get(
		"/api/agent/reputation",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			const { data: configData, error: fetchError } = await supabaseAdmin
				.from("agent_configs")
				.select("agent_8004_id")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", "fx")
				.single();

			if (fetchError || !configData) {
				return reply.status(404).send({ error: "Agent not configured" });
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
				console.error("Failed to fetch agent reputation:", err);
				return reply.status(500).send({ error: "Failed to fetch reputation" });
			}
		},
	);

	// GET /api/agent/:walletAddress/8004-metadata — public endpoint (no auth)
	app.get("/api/agent/:walletAddress/8004-metadata", async (request, reply) => {
		const { walletAddress } = request.params as { walletAddress: string };
		const query = request.query as { agent_type?: string };
		const agentType = query.agent_type === "yield" ? "yield" : "fx";

		const [profileResult, configResult] = await Promise.all([
			supabaseAdmin
				.from("user_profiles")
				.select("display_name")
				.eq("wallet_address", walletAddress)
				.single(),
			supabaseAdmin
				.from("agent_configs")
				.select("active, agent_type")
				.eq("wallet_address", walletAddress)
				.eq("agent_type", agentType)
				.single(),
		]);

		if (configResult.error || !configResult.data) {
			return reply.status(404).send({ error: "Agent not found" });
		}

		const displayName =
			profileResult.data?.display_name ?? walletAddress.slice(0, 8);
		const agentConfig = configResult.data as Pick<
			AgentConfigRow,
			"active" | "agent_type"
		>;

		const agentLabel = agentType === "yield" ? "Yield" : "FX";
		const agentName = `MantleAgents-${agentLabel}-${displayName.replace(/\s+/g, "-")}`;
		const agentDesc =
			"MantleAgents runs autonomous AI agents that read the news, hunt yield, rebalance your portfolio, and execute on-chain — while you touch grass. No Bloomberg terminal. No gas fees. No babysitting.";
		const teeSummary = await getLatestAttestationSummary({
			walletAddress,
			agentType,
		});
		const nowUnix = Math.floor(Date.now() / 1000);

		return {
			type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
			name: agentName,
			description: agentDesc,
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
					endpoint:
						agentType === "yield"
							? `${process.env.PUBLIC_API_BASE_URL || "https://api.mantleagents.co"}/api/yield-agent/attestations`
							: `${process.env.PUBLIC_API_BASE_URL || "https://api.mantleagents.co"}/api/agent/attestations`,
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
					attestationEndpoint:
						agentType === "yield"
							? `${process.env.PUBLIC_API_BASE_URL || "https://api.mantleagents.co"}/api/yield-agent/attestations`
							: `${process.env.PUBLIC_API_BASE_URL || "https://api.mantleagents.co"}/api/agent/attestations`,
				},
			},
			x402Support: false,
			active: agentConfig.active,
		};
	});

	// GET /api/agent/portfolio/history
	app.get(
		"/api/agent/portfolio/history",
		{ preHandler: authMiddleware },
		async (request, reply) => {
			const walletAddress = request.user?.walletAddress;
			if (!walletAddress) return reply.status(401).send({ error: "Unauthorized" });

			// Look up the server wallet to get positions for this user
			const { data: positions } = await supabaseAdmin
				.from("agent_positions")
				.select("token_symbol, balance")
				.eq("wallet_address", walletAddress)
				.gt("balance", 0);

			if (!positions || positions.length === 0) {
				return { history: [] };
			}

			const symbols = positions.map((p) => p.token_symbol);

			// Fetch last 30 days of snapshots for these tokens
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

			const { data: snapshots } = await supabaseAdmin
				.from("token_price_snapshots")
				.select("token_symbol, price_usd, snapshot_at")
				.in("token_symbol", symbols)
				.gte("snapshot_at", thirtyDaysAgo.toISOString())
				.order("snapshot_at", { ascending: true });

			if (!snapshots || snapshots.length === 0) {
				return { history: [] };
			}

			// For each day, take the LAST price snapshot per token then sum across tokens.
			// key: "day|symbol" → last price seen that day
			const balanceMap = new Map(
				positions.map((p) => [p.token_symbol, p.balance]),
			);

			const lastPricePerDayToken = new Map<string, number>();

			// Snapshots are ordered ascending by time, so later entries overwrite earlier ones
			for (const snap of snapshots) {
				if (!snap.snapshot_at) continue;
				const day = snap.snapshot_at.split("T")[0];
				lastPricePerDayToken.set(`${day}|${snap.token_symbol}`, snap.price_usd);
			}

			// Sum across tokens per day
			const dailyValues = new Map<string, number>();
			for (const [key, price] of lastPricePerDayToken) {
				const [day, symbol] = key.split("|");
				const balance = balanceMap.get(symbol) ?? 0;
				dailyValues.set(day, (dailyValues.get(day) ?? 0) + balance * price);
			}

			const history = Array.from(dailyValues.entries())
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([date, valueUsd]) => ({
					date,
					valueUsd: Math.round(valueUsd * 100) / 100,
				}));

			return { history };
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
