import {
  createPublicClient,
  http,
  type Address,
  parseUnits,
  formatUnits,
  encodeFunctionData,
} from 'viem';
import { bsc } from 'viem/chains';
import type { YieldExecutionResult } from '@mantleagents/shared';
import { sendTransactionFromServerWallet } from '../lib/thirdweb-wallet.js';

const yieldPublicClient = createPublicClient({ chain: bsc, transport: http() });

// ─── Ichi vault ABI ──────────────────────────────────────────────────────────

const ICHI_VAULT_ABI = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'allowToken0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { name: 'allowToken1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'deposit0', type: 'uint256' },
      { name: 'deposit1', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }, { name: 'to', type: 'address' }], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
] as const;

// ─── PancakeSwap V3 (CLAMM) ABIs ─────────────────────────────────────────────

const PANCAKE_V3_POOL_ABI = [
  { name: 'token0', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'token1', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'fee', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint24' }] },
  { name: 'tickSpacing', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'int24' }] },
  {
    name: 'slot0',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
] as const;

// PancakeSwap V3 NonfungiblePositionManager on BSC
const PANCAKE_NFPM_ADDRESS = '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364' as Address;

const PANCAKE_NFPM_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'token0', type: 'address' },
          { name: 'token1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'amount0Desired', type: 'uint256' },
          { name: 'amount1Desired', type: 'uint256' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
  {
    name: 'decreaseLiquidity',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'liquidity', type: 'uint128' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
  {
    name: 'collect',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const;

// ─── ERC-20 ABI ───────────────────────────────────────────────────────────────

const ERC20_ABI = [
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

// ─── Stablecoin registry (BSC) ────────────────────────────────────────────────

const STABLE_PRICE: Record<string, number> = {
  '0x55d398326f99059ff775485246999027b3197955': 1.0, // USDT BSC (18 dec)
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': 1.0, // USDC BSC (18 dec)
  '0xe9e7cea3dedca5984780bafc599bd69add087d56': 1.0, // BUSD BSC (18 dec)
  '0xd17479997f34dd9156deef8d7a048c652c1426df': 1.0, // USDD BSC (18 dec)
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Approve token spend — transaction sent from agent wallet (serverWalletAddress)
 * via Thirdweb sponsored tx. Gas paid by Thirdweb paymaster.
 */
async function approveToken(
  serverWalletAddress: string,
  tokenAddress: Address,
  spender: Address,
  amount: bigint,
): Promise<void> {
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, amount] });
  const txHash = await sendTransactionFromServerWallet(serverWalletAddress, { to: tokenAddress, data });
  await yieldPublicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`[yield-executor] Approved ${tokenAddress}: ${txHash}`);
}

/** Round a tick down to the nearest multiple of tickSpacing */
function floorTick(tick: number, spacing: number): number {
  return Math.floor(tick / spacing) * spacing;
}

// ─── PancakeSwap V3 (CLAMM) single-sided deposit ─────────────────────────────

/**
 * Deposit into a PancakeSwap V3 pool from the agent wallet (serverWalletAddress = 0xf737...).
 * Gas is sponsored by Thirdweb paymaster (0xBBA5... funds the billing).
 * Single-sided out-of-range position: only one token (USDT/USDC) is consumed.
 */
async function executeCLAMMDeposit(params: {
  poolAddress: Address;
  serverWalletAddress: string;
  amountUsd: number;
}): Promise<YieldExecutionResult> {
  const { poolAddress, serverWalletAddress, amountUsd } = params;
  const walletAddr = serverWalletAddress as Address;

  // 1. Read pool metadata
  const [token0, token1, fee, tickSpacingRaw, slot0] = await Promise.all([
    yieldPublicClient.readContract({ address: poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: 'token0' }) as Promise<Address>,
    yieldPublicClient.readContract({ address: poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: 'token1' }) as Promise<Address>,
    yieldPublicClient.readContract({ address: poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: 'fee' }) as Promise<number>,
    yieldPublicClient.readContract({ address: poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: 'tickSpacing' }) as Promise<number>,
    yieldPublicClient.readContract({ address: poolAddress, abi: PANCAKE_V3_POOL_ABI, functionName: 'slot0' }) as Promise<readonly [bigint, number, ...unknown[]]>,
  ]);

  const currentTick = Number(slot0[1]);
  const tickSpacing = Number(tickSpacingRaw);
  const roundedTick = floorTick(currentTick, tickSpacing);

  console.log(`[yield-executor] CLAMM pool ${poolAddress}: token0=${token0}, token1=${token1}, currentTick=${currentTick}`);

  // 2. Read balances from agent wallet (0xf737...)
  const [bal0, bal1, dec0, dec1] = await Promise.all([
    yieldPublicClient.readContract({ address: token0, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] }) as Promise<bigint>,
    yieldPublicClient.readContract({ address: token1, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] }) as Promise<bigint>,
    yieldPublicClient.readContract({ address: token0, abi: ERC20_ABI, functionName: 'decimals' }) as Promise<number>,
    yieldPublicClient.readContract({ address: token1, abi: ERC20_ABI, functionName: 'decimals' }) as Promise<number>,
  ]);

  const usdVal0 = Number(formatUnits(bal0, dec0)) * (STABLE_PRICE[token0.toLowerCase()] ?? 0);
  const usdVal1 = Number(formatUnits(bal1, dec1)) * (STABLE_PRICE[token1.toLowerCase()] ?? 0);

  console.log(`[yield-executor] Agent wallet ${serverWalletAddress}: token0=$${usdVal0.toFixed(2)}, token1=$${usdVal1.toFixed(2)}`);

  if (usdVal0 === 0 && usdVal1 === 0) {
    return {
      success: false,
      action: 'deposit',
      error: `Agent wallet ${serverWalletAddress} has no USDT/USDC. Fund the agent wallet with stablecoins.`,
    };
  }

  // Use token with larger USD value
  const useToken0 = usdVal0 >= usdVal1;
  const depositToken = useToken0 ? token0 : token1;
  const depositDecimals = useToken0 ? dec0 : dec1;
  const depositBalance = useToken0 ? bal0 : bal1;

  const priceUsd = STABLE_PRICE[depositToken.toLowerCase()] ?? 1.0;
  const desiredAmount = parseUnits((amountUsd / priceUsd).toFixed(depositDecimals), depositDecimals);

  // Safety cap: never deposit more than 80% of available balance
  const maxSafeAmount = (depositBalance * 80n) / 100n;
  const actualAmount = desiredAmount < maxSafeAmount ? desiredAmount : maxSafeAmount;

  if (actualAmount === 0n) {
    return { success: false, action: 'deposit', error: `Insufficient balance in agent wallet ${serverWalletAddress}` };
  }

  console.log(`[yield-executor] CLAMM: depositing ${formatUnits(actualAmount, depositDecimals)} from agent wallet ${serverWalletAddress}`);

  // 3. Out-of-range ticks — only one token consumed
  let tickLower: number;
  let tickUpper: number;
  let amount0Desired: bigint;
  let amount1Desired: bigint;

  if (useToken0) {
    // Range entirely above current price → only token0 consumed
    tickLower = roundedTick + tickSpacing;
    tickUpper = roundedTick + tickSpacing * 200;
    amount0Desired = actualAmount;
    amount1Desired = 0n;
  } else {
    // Range entirely below current price → only token1 consumed
    tickLower = roundedTick - tickSpacing * 200;
    tickUpper = roundedTick - tickSpacing;
    amount0Desired = 0n;
    amount1Desired = actualAmount;
  }

  tickLower = Math.max(-887272, Math.min(887272, tickLower));
  tickUpper = Math.max(-887272, Math.min(887272, tickUpper));

  // 4. Approve NFPM from agent wallet
  await approveToken(serverWalletAddress, depositToken, PANCAKE_NFPM_ADDRESS, actualAmount);

  // 5. Mint — recipient is the agent wallet (0xf737...)
  const mintData = encodeFunctionData({
    abi: PANCAKE_NFPM_ABI,
    functionName: 'mint',
    args: [{
      token0, token1, fee, tickLower, tickUpper,
      amount0Desired, amount1Desired,
      amount0Min: 0n, amount1Min: 0n,
      recipient: walletAddr,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
    }],
  });

  const mintTx = await sendTransactionFromServerWallet(serverWalletAddress, {
    to: PANCAKE_NFPM_ADDRESS,
    data: mintData,
  });
  const receipt = await yieldPublicClient.waitForTransactionReceipt({ hash: mintTx });

  if (receipt.status !== 'success') {
    return { success: false, action: 'deposit', error: `Mint reverted: ${mintTx}` };
  }

  console.log(`[yield-executor] CLAMM minted from agent wallet: ${mintTx}`);
  return { success: true, action: 'deposit', txHash: mintTx, amountUsd, vaultAddress: poolAddress };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function executeYieldDeposit(params: {
  serverWalletId: string;
  serverWalletAddress: string;
  vaultAddress: Address;
  amountUsd: number;
}): Promise<YieldExecutionResult> {
  const { serverWalletAddress, vaultAddress, amountUsd } = params;
  const walletAddr = serverWalletAddress as Address;

  console.log(`[yield-executor] Agent wallet: ${serverWalletAddress}`);

  // Detect vault type: slot0() → CLAMM, allowToken0() → Ichi
  let isCLAMM = false;
  try {
    await yieldPublicClient.readContract({ address: vaultAddress, abi: PANCAKE_V3_POOL_ABI, functionName: 'slot0' });
    isCLAMM = true;
  } catch { isCLAMM = false; }

  if (isCLAMM) {
    return executeCLAMMDeposit({ poolAddress: vaultAddress, serverWalletAddress, amountUsd });
  }

  // ── Ichi vault ───────────────────────────────────────────────────────────
  const [token0, token1] = await Promise.all([
    yieldPublicClient.readContract({ address: vaultAddress, abi: ICHI_VAULT_ABI, functionName: 'token0' }) as Promise<Address>,
    yieldPublicClient.readContract({ address: vaultAddress, abi: ICHI_VAULT_ABI, functionName: 'token1' }) as Promise<Address>,
  ]);

  let isToken0 = true;
  try {
    const [allow0, allow1] = await Promise.all([
      yieldPublicClient.readContract({ address: vaultAddress, abi: ICHI_VAULT_ABI, functionName: 'allowToken0' }) as Promise<boolean>,
      yieldPublicClient.readContract({ address: vaultAddress, abi: ICHI_VAULT_ABI, functionName: 'allowToken1' }) as Promise<boolean>,
    ]);
    isToken0 = allow0 || !allow1;
  } catch {
    isToken0 = !!STABLE_PRICE[token0.toLowerCase()];
    if (!isToken0 && !STABLE_PRICE[token1.toLowerCase()]) isToken0 = true;
  }
  const depositToken = isToken0 ? token0 : token1;

  const decimals = await yieldPublicClient.readContract({ address: depositToken, abi: ERC20_ABI, functionName: 'decimals' }) as number;
  const priceUsd = STABLE_PRICE[depositToken.toLowerCase()] ?? 1.0;
  const tokenAmount = parseUnits((amountUsd / priceUsd).toFixed(decimals), decimals);

  const balance = await yieldPublicClient.readContract({ address: depositToken, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddr] }) as bigint;
  const maxSafeAmount = (balance * 80n) / 100n;
  const actualAmount = tokenAmount < maxSafeAmount ? tokenAmount : maxSafeAmount;

  if (actualAmount === 0n) {
    return { success: false, action: 'deposit', error: `No balance in agent wallet ${serverWalletAddress}` };
  }

  await approveToken(serverWalletAddress, depositToken, vaultAddress, actualAmount);

  const depositData = encodeFunctionData({
    abi: ICHI_VAULT_ABI, functionName: 'deposit',
    args: [isToken0 ? actualAmount : 0n, isToken0 ? 0n : actualAmount, walletAddr],
  });
  const depositTx = await sendTransactionFromServerWallet(serverWalletAddress, { to: vaultAddress, data: depositData });
  const receipt = await yieldPublicClient.waitForTransactionReceipt({ hash: depositTx });

  if (receipt.status !== 'success') {
    return { success: false, action: 'deposit', error: `Deposit reverted: ${depositTx}` };
  }

  console.log(`[yield-executor] Ichi deposited: ${depositTx}`);
  return { success: true, action: 'deposit', txHash: depositTx, amountUsd, vaultAddress };
}

export async function executeYieldWithdraw(params: {
  serverWalletId: string;
  serverWalletAddress: string;
  vaultAddress: Address;
}): Promise<YieldExecutionResult> {
  const { serverWalletAddress, vaultAddress } = params;
  const walletAddr = serverWalletAddress as Address;

  const shares = await yieldPublicClient.readContract({
    address: vaultAddress, abi: ICHI_VAULT_ABI, functionName: 'balanceOf', args: [walletAddr],
  }) as bigint;

  if (shares === 0n) {
    return { success: false, action: 'withdraw', error: 'No LP shares to withdraw' };
  }

  const withdrawData = encodeFunctionData({
    abi: ICHI_VAULT_ABI, functionName: 'withdraw', args: [shares, walletAddr],
  });
  const txHash = await sendTransactionFromServerWallet(serverWalletAddress, { to: vaultAddress, data: withdrawData });
  const receipt = await yieldPublicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    return { success: false, action: 'withdraw', error: `Withdraw reverted: ${txHash}` };
  }

  console.log(`[yield-executor] Withdrew from agent wallet: ${txHash}`);
  return { success: true, action: 'withdraw', txHash, vaultAddress };
}
