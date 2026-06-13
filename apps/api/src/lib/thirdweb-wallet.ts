/**
 * Thirdweb server wallet library for MantleAgents.
 * Replaces Privy: create wallets, send sponsored transactions (EIP-7702), sign typed data.
 */
const THIRDWEB_API_BASE = 'https://api.thirdweb.com';
const DEFAULT_CHAIN_ID = 56; // BSC

function getSecretKey(): string {
  const key = process.env.THIRDWEB_SECRET_KEY;
  if (!key) {
    throw new Error('THIRDWEB_SECRET_KEY is required');
  }
  return key;
}

export interface CreateServerWalletResult {
  address: string;
  createdAt?: string;
}

/**
 * Create a server wallet via thirdweb API.
 * Idempotent for the same identifier.
 * POST /v1/wallets/server
 */
export async function createServerWallet(
  identifier: string,
): Promise<CreateServerWalletResult> {
  const res: any = await fetch(`${THIRDWEB_API_BASE}/v1/wallets/server`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-key': getSecretKey(),
    },
    body: JSON.stringify({ identifier }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `thirdweb createServerWallet failed (${res.status}): ${text}`,
    );
  }

  const json = (await res.json()) as {
    result?: { address?: string; createdAt?: string };
    address?: string;
  };
  const address = json.result?.address ?? json.address;
  if (!address || typeof address !== 'string') {
    throw new Error(
      `thirdweb createServerWallet: no address in response: ${JSON.stringify(json)}`,
    );
  }

  return {
    address,
    createdAt: json.result?.createdAt,
  };
}

export interface TransactionInput {
  to: string;
  data: string;
  value?: string;
}

export interface SendSponsoredTransactionParams {
  chainId: number;
  from: string;
  transactions: TransactionInput[];
}

export interface SendSponsoredTransactionResult {
  transactionIds: string[];
}

/**
 * Send sponsored transaction(s) from a server wallet.
 * Gas is sponsored (EIP-7702) via thirdweb API.
 * POST /v1/transactions
 */
export async function sendSponsoredTransaction(
  params: SendSponsoredTransactionParams,
): Promise<SendSponsoredTransactionResult> {
  const { chainId, from, transactions } = params;

  const body = {
    chainId,
    from,
    transactions: transactions.map((tx) => ({
      to: tx.to,
      data: tx.data,
      value: tx.value ?? '0',
    })),
  };

  const res: any = await fetch(`${THIRDWEB_API_BASE}/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-key': getSecretKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `thirdweb sendSponsoredTransaction failed (${res.status}): ${text}`,
    );
  }

  const json = (await res.json()) as {
    result?: { transactionIds?: string[] };
    transactionIds?: string[];
  };
  const ids = json.result?.transactionIds ?? json.transactionIds ?? [];
  return {
    transactionIds: Array.isArray(ids) ? ids : [String(ids)],
  };
}

export interface EIP712TypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Sign EIP-712 typed data with a thirdweb server wallet.
 * Uses Engine.serverWallet from thirdweb SDK (requires secretKey client).
 * Chain is required for signing messages.
 */
export async function signTypedData(params: {
  from: string;
  typedData: EIP712TypedData;
}): Promise<`0x${string}`> {
  const { from, typedData } = params;
  const { Engine, defineChain } = await import('thirdweb');
  const { thirdwebClient } = await import('./thirdweb.js');

  const defaultChain = defineChain(DEFAULT_CHAIN_ID);

  const account = Engine.serverWallet({
    client: thirdwebClient,
    address: from,
    chain: defaultChain,
  });

  const signature = await account.signTypedData({
    domain: {
      ...typedData.domain,
      verifyingContract: typedData.domain.verifyingContract as `0x${string}`,
    },
    types: typedData.types,
    primaryType: typedData.primaryType as 'AgentWalletSet',
    message: typedData.message,
  });

  return signature as `0x${string}`;
}

/**
 * Wait for a transaction hash from thirdweb transaction IDs.
 * Use after sendSponsoredTransaction when you need the on-chain hash.
 */
export async function waitForTransactionHash(transactionId: string): Promise<`0x${string}`> {
  const { Engine } = await import('thirdweb');
  const { thirdwebClient } = await import('./thirdweb.js');

  const { transactionHash } = await Engine.waitForTransactionHash({
    client: thirdwebClient,
    transactionId,
  });

  return transactionHash as `0x${string}`;
}

/**
 * Send a single transaction from a server wallet (gasless).
 * Convenience wrapper around sendSponsoredTransaction + waitForTransactionHash.
 */
export async function sendTransactionFromServerWallet(
  serverWalletAddress: string,
  tx: { to: string; data: string; value?: string | bigint },
): Promise<`0x${string}`> {
  const value =
    tx.value === undefined
      ? '0'
      : typeof tx.value === 'bigint'
        ? `0x${tx.value.toString(16)}`
        : tx.value;

  const { transactionIds } = await sendSponsoredTransaction({
    chainId: DEFAULT_CHAIN_ID,
    from: serverWalletAddress,
    transactions: [{ to: tx.to, data: tx.data, value }],
  });

  return waitForTransactionHash(transactionIds[0]);
}

/**
 * Create a wallet-like client for vault adapters and other code that expects
 * walletClient.sendTransaction(). Gasless via thirdweb.
 */
export function createServerWalletClient(serverWalletAddress: string) {
  return {
    chain: { id: DEFAULT_CHAIN_ID } as const,
    sendTransaction: async (tx: { to: string; data: string; value?: bigint }) =>
      sendTransactionFromServerWallet(serverWalletAddress, tx),
  };
}
