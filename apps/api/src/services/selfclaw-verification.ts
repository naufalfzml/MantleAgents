import {
  createPrivateKey,
  generateKeyPairSync,
  sign,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { createSupabaseAdmin, type Database } from '@mantleagents/db';
import type { SelfClawVerification } from '@mantleagents/shared';

const SELFCLAW_API_URL = process.env.SELFCLAW_API_URL || 'https://selfclaw.ai';
const BASE = `${SELFCLAW_API_URL}/api/selfclaw/v1`;

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createSupabaseAdmin(url, key);
}
const supabaseAdmin = getSupabaseAdmin();

type UserProfileRow = Database['public']['Tables']['user_profiles']['Row'];

function getEncryptionKey(): Buffer {
  const key = process.env.SELFCLAW_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('SELFCLAW_ENCRYPTION_KEY is required for SelfClaw verification');
  }
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) {
    throw new Error('SELFCLAW_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return buf;
}

export interface Ed25519Keypair {
  publicKeySpki: string;
  privateKeyPkcs8: string;
}

/** Generate Ed25519 keypair, export as SPKI/PKCS8 DER base64 */
export function generateAgentKeys(): Ed25519Keypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const privateKeyPkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  return { publicKeySpki, privateKeyPkcs8 };
}

function encryptPrivateKey(privateKeyPkcs8: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKeyPkcs8, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptPrivateKey(encrypted: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data) + decipher.final('utf8');
}

function signWithPrivateKey(privateKeyPkcs8Encrypted: string, payload: string): string {
  const privateKeyPkcs8 = decryptPrivateKey(privateKeyPkcs8Encrypted);
  const privateKeyDer = Buffer.from(privateKeyPkcs8, 'base64');
  const privateKey = createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8',
  });
  const sig = sign(null, Buffer.from(payload, 'utf8'), privateKey);
  return sig.toString('hex');
}

/** Get server wallet address for FX agent (used for SelfClaw register-wallet) */
async function getServerWalletAddress(walletAddress: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('agent_configs')
    .select('server_wallet_address')
    .eq('wallet_address', walletAddress)
    .eq('agent_type', 'fx')
    .single();
  return data?.server_wallet_address ?? null;
}

export interface StartVerificationResult {
  sessionId: string;
  qrCodeUrl: string;
  agentName: string;
}

/**
 * Start SelfClaw verification flow.
 * Generates Ed25519 keypair, calls SelfClaw API, signs challenge, returns QR data.
 */
export async function startVerification(
  walletAddress: string,
  agentName: string,
): Promise<StartVerificationResult> {
  const normalizedName = agentName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `mantleagents-${walletAddress.slice(2, 10)}`;

  // Check if already verified
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('selfclaw_verified')
    .eq('wallet_address', walletAddress)
    .single();

  if (profile?.selfclaw_verified) {
    throw new Error('Already verified with SelfClaw');
  }

  // Check name availability
  const checkRes = await fetch(`${BASE}/check-name/${encodeURIComponent(normalizedName)}`);
  if (!checkRes.ok) {
    const err = await checkRes.text();
    throw new Error(`SelfClaw name check failed: ${err}`);
  }
  const checkJson = (await checkRes.json()) as { available?: boolean; suggestions?: string[] };
  const finalName = checkJson.available ? normalizedName : (checkJson.suggestions?.[0] ?? normalizedName);

  // Generate keypair
  const { publicKeySpki, privateKeyPkcs8 } = generateAgentKeys();
  const encryptedPrivate = encryptPrivateKey(privateKeyPkcs8);

  // Start verification
  const startRes = await fetch(`${BASE}/start-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentPublicKey: publicKeySpki,
      agentName: finalName,
    }),
  });

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`SelfClaw start-verification failed: ${err}`);
  }

  const startJson = (await startRes.json()) as {
    challenge?: string;
    sessionId?: string;
    selfApp?: { qrCodeUrl?: string; deeplink?: string };
  };

  const challenge = startJson.challenge;
  const sessionId = startJson.sessionId;
  if (!challenge || !sessionId) {
    throw new Error('SelfClaw start-verification: missing challenge or sessionId');
  }

  // Sign challenge (we need to use the raw private key before encrypting - we already have it)
  const privateKeyDer = Buffer.from(privateKeyPkcs8, 'base64');
  const privateKey = createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(challenge, 'utf8'), privateKey).toString('hex');

  const signRes = await fetch(`${BASE}/sign-challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, signature }),
  });

  if (!signRes.ok) {
    const err = await signRes.text();
    throw new Error(`SelfClaw sign-challenge failed: ${err}`);
  }

  const qrCodeUrl =
    startJson.selfApp?.qrCodeUrl ??
    startJson.selfApp?.deeplink ??
    `https://self.xyz`;

  // Store in DB (upsert so we have a row even if profile was created elsewhere)
  await supabaseAdmin
    .from('user_profiles')
    .upsert(
      {
        wallet_address: walletAddress,
        selfclaw_public_key: publicKeySpki,
        selfclaw_private_key: encryptedPrivate,
        selfclaw_agent_name: finalName,
        selfclaw_session_id: sessionId,
      },
      { onConflict: 'wallet_address' },
    );

  return {
    sessionId,
    qrCodeUrl,
    agentName: finalName,
  };
}

export type VerificationPollStatus = 'pending' | 'verified' | 'expired';

export interface CheckVerificationResult {
  status: VerificationPollStatus;
  verified: boolean;
  agentName?: string;
  humanId?: string;
  verifiedAt?: string;
}

/**
 * Poll SelfClaw verification status. If verified, updates DB and registers wallet.
 */
export async function checkVerificationStatus(
  walletAddress: string,
): Promise<CheckVerificationResult> {
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('selfclaw_session_id, selfclaw_public_key, selfclaw_private_key, selfclaw_agent_name')
    .eq('wallet_address', walletAddress)
    .single();

  const row = profile as Pick<
    UserProfileRow,
    'selfclaw_session_id' | 'selfclaw_public_key' | 'selfclaw_private_key' | 'selfclaw_agent_name'
  > | null;

  if (!row?.selfclaw_session_id) {
    return {
      status: 'expired',
      verified: false,
    };
  }

  const statusRes = await fetch(
    `${BASE}/verification-status/${encodeURIComponent(row.selfclaw_session_id)}`,
  );

  if (!statusRes.ok) {
    const err = await statusRes.text();
    throw new Error(`SelfClaw verification-status failed: ${err}`);
  }

  const statusJson = (await statusRes.json()) as { status?: string };
  const status = (statusJson.status ?? 'pending') as VerificationPollStatus;

  if (status === 'verified') {
    const serverWallet = await getServerWalletAddress(walletAddress);

    if (row.selfclaw_public_key && row.selfclaw_private_key && serverWallet) {
      const body = JSON.stringify({ walletAddress: serverWallet });
      const sig = signWithPrivateKey(row.selfclaw_private_key, body);

      const registerRes = await fetch(`${BASE}/register-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${row.selfclaw_public_key}:${sig}`,
        },
        body,
      });

      if (!registerRes.ok) {
        console.warn(
          `[SelfClaw] register-wallet failed for ${walletAddress}:`,
          await registerRes.text(),
        );
      }
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from('user_profiles')
      .update({
        selfclaw_verified: true,
        selfclaw_verified_at: now,
        selfclaw_session_id: null,
      })
      .eq('wallet_address', walletAddress);

    return {
      status: 'verified',
      verified: true,
      agentName: row.selfclaw_agent_name ?? undefined,
      verifiedAt: now,
    };
  }

  if (status === 'expired') {
    await supabaseAdmin
      .from('user_profiles')
      .update({ selfclaw_session_id: null })
      .eq('wallet_address', walletAddress);
  }

  return {
    status,
    verified: false,
    agentName: row.selfclaw_agent_name ?? undefined,
  };
}

/**
 * Get current verification info from DB (no external API call).
 */
export async function getVerificationInfo(
  walletAddress: string,
): Promise<SelfClawVerification> {
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('selfclaw_verified, selfclaw_agent_name, selfclaw_human_id, selfclaw_verified_at, selfclaw_session_id')
    .eq('wallet_address', walletAddress)
    .single();

  const row = data as Pick<
    UserProfileRow,
    'selfclaw_verified' | 'selfclaw_agent_name' | 'selfclaw_human_id' | 'selfclaw_verified_at' | 'selfclaw_session_id'
  > | null;

  return {
    verified: row?.selfclaw_verified ?? false,
    agentName: row?.selfclaw_agent_name ?? null,
    humanId: row?.selfclaw_human_id ?? null,
    verifiedAt: row?.selfclaw_verified_at ?? null,
    sessionId: row?.selfclaw_session_id ?? null,
  };
}
