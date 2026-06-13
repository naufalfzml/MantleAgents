// @mantleagents/mantle-data — AVE Cloud API SDK wrapper

export { MantleDataClient, MantleDataApiError } from './client.js';

export * from './types.js';

export {
  searchToken,
  getTokenDetail,
  batchSearchTokens,
  batchTokenPrices,
  getKlineByToken,
  getKlineByPair,
  getTop100Holders,
  getHolders,
  checkContractRisk,
  getSwapTxs,
  getPlatformTokens,
  getTrending,
  getMainTokens,
  getSupportedChains,
  getWalletTokens,
  getWalletOverview,
  getAddressPnl,
} from './data-rest.js';

export {
  getAmountOut,
  createEvmTx,
  sendSignedEvmTx,
  createSolanaTx,
  sendSignedSolanaTx,
  executeTrade,
} from './trade-chain-wallet.js';

export type { ExecuteTradeParams } from './trade-chain-wallet.js';
