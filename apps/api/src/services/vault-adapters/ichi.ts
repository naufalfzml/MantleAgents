// TODO: implement multi-chain logic — was using ichiVaultAbi from @mantleagents/mantle-data
// for Ichi vault interactions.

import {
	type Address,
	type PublicClient,
} from "viem";
import type {
	DepositParams,
	TxResult,
	VaultAdapter,
	VaultInfo,
	VaultPosition,
	WithdrawParams,
} from "./types.js";

export class IchiVaultAdapter implements VaultAdapter {
	protocol = "ichi" as const;

	async getVaultInfo(
		address: Address,
		_client: PublicClient,
	): Promise<VaultInfo> {
		throw new Error(`IchiVaultAdapter.getVaultInfo not yet implemented for multi-chain (vault: ${address})`);
	}

	async deposit(_params: DepositParams): Promise<TxResult> {
		throw new Error("IchiVaultAdapter.deposit not yet implemented for multi-chain");
	}

	async withdraw(_params: WithdrawParams): Promise<TxResult> {
		throw new Error("IchiVaultAdapter.withdraw not yet implemented for multi-chain");
	}

	async getPosition(
		vaultAddress: Address,
		_walletAddress: Address,
		_client: PublicClient,
	): Promise<VaultPosition> {
		return {
			vaultAddress,
			lpShares: 0n,
			token0Amount: 0n,
			token1Amount: 0n,
			token0: "0x0000000000000000000000000000000000000000" as Address,
			token1: "0x0000000000000000000000000000000000000000" as Address,
		};
	}

	getDepositToken(info: VaultInfo): { token: Address; decimals: number } {
		if (info.allowToken0) return { token: info.token0, decimals: 6 };
		if (info.allowToken1) return { token: info.token1, decimals: 18 };
		throw new Error("Vault does not allow deposits on either token");
	}
}
