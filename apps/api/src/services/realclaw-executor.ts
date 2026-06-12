// realclaw-executor.ts
//
// Execution layer for Mantle trades via the RealClaw / Byreal Skills CLI
// agent layer (https://openclaw.mantle.xyz). RealClaw sits in front of
// Merchant Moe / Agni Finance / Fluxion and keeps swaps non-custodial via
// Privy, so the platform never needs to hold raw private keys.
//
// STATUS: scaffold / interface only. The actual RealClaw API surface
// (auth flow, request/response shapes, supported skills) needs to be
// confirmed against the live docs at openclaw.mantle.xyz and the
// byreal-agent-skills repo before wiring this up for real — those details
// were not available at the time this scaffold was written. Fill in
// REALCLAW_API_BASE, the auth headers, and the skill invocation payload
// shape per the docs, then remove the `throw` in `callRealClawSkill`.
//
// Once implemented, this becomes the Mantle execution path called from
// trade-executor.ts (and yield-executor.ts) whenever the target chain is
// Mantle, replacing the AVE Trade Chain-Wallet path used for
// Solana/BSC/ETH/Base.

export interface RealClawSwapParams {
  /** Server wallet address (Privy-managed) executing the swap */
  walletAddress: string;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string; // base units, as string to avoid bigint/JSON issues
  /** Max slippage in basis points, e.g. 100 = 1% */
  slippageBps?: number;
}

export interface RealClawSwapResult {
  success: boolean;
  txHash?: string;
  amountOut?: string;
  error?: string;
}

export interface RealClawSkillResponse {
  [key: string]: unknown;
}

const REALCLAW_API_BASE = process.env.REALCLAW_API_BASE || 'https://openclaw.mantle.xyz/api';

/**
 * Low-level call to a RealClaw / Byreal Skills CLI skill endpoint.
 *
 * TODO: confirm against openclaw.mantle.xyz docs:
 *  - exact base path / versioning (e.g. /v1/skills/...)
 *  - auth scheme (API key header? Privy session token? agent identity sig?)
 *  - request body shape per skill
 */
async function callRealClawSkill(
  skill: string,
  payload: Record<string, unknown>,
): Promise<RealClawSkillResponse> {
  const apiKey = process.env.REALCLAW_API_KEY;
  if (!apiKey) {
    throw new Error(
      'REALCLAW_API_KEY is not set. RealClaw/Byreal Skills CLI integration is not yet ' +
        'configured — see apps/api/src/services/realclaw-executor.ts for setup notes.',
    );
  }

  const res = await fetch(`${REALCLAW_API_BASE}/skills/${skill}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RealClaw skill "${skill}" failed: ${res.status} ${text}`);
  }

  return (await res.json()) as RealClawSkillResponse;
}

/**
 * Execute a token swap on Mantle via RealClaw, routed through whichever
 * on-chain venue (Merchant Moe / Agni Finance / Fluxion) RealClaw selects
 * internally.
 *
 * NOTE: This is the function trade-executor.ts / convert-to-usdc.ts /
 * yield-executor.ts should call once REALCLAW_API_KEY is configured and
 * the skill name + payload shape below are confirmed against the docs.
 */
export async function executeRealClawSwap(
  params: RealClawSwapParams,
): Promise<RealClawSwapResult> {
  try {
    // TODO: replace 'dex-swap' and the payload keys with the real skill
    // name + schema from byreal-agent-skills.
    const result = await callRealClawSkill('dex-swap', {
      wallet: params.walletAddress,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      slippageBps: params.slippageBps ?? 100,
    });

    return {
      success: true,
      txHash: result.txHash as string | undefined,
      amountOut: result.amountOut as string | undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Whether RealClaw execution is configured and should be used for Mantle
 * trades. Callers should fall back to an error (not silently skip) if this
 * is false but a Mantle trade was requested — see trade-executor.ts.
 */
export function isRealClawConfigured(): boolean {
  return Boolean(process.env.REALCLAW_API_KEY);
}
