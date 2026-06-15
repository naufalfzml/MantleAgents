export const STABLE_TOKENS = [
  'USDm',
  'EURm',
  'BRLm',
  'KESm',
  'PHPm',
  'COPm',
  'XOFm',
  'NGNm',
  'JPYm',
  'CHFm',
  'ZARm',
  'GBPm',
  'AUDm',
  'CADm',
  'GHSm',
] as const;

export type StableToken = (typeof STABLE_TOKENS)[number];

export const BASE_TOKENS = ['USDC', 'USDT'] as const;
export type BaseToken = (typeof BASE_TOKENS)[number];

export const COMMODITY_TOKENS = ['XAUT'] as const;
export type CommodityToken = (typeof COMMODITY_TOKENS)[number];

export type SupportedToken = StableToken | BaseToken | CommodityToken;

export interface TokenInfo {
  symbol: SupportedToken;
  name: string;
  priceUsd: number;
  change24hPct: number;
  sparkline7d: number[];
  flag?: string;
  decimals?: number;
}

export interface MarketTokensResponse {
  tokens: TokenInfo[];
  updatedAt: string;
}

export const STABLE_TOKEN_ADDRESSES: Record<StableToken, string> = {
  USDm: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
  EURm: '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73',
  BRLm: '0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787',
  KESm: '0x456a3D042C0DbD3db53D5489e98dFb038553B0d0',
  PHPm: '0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B',
  COPm: '0x8A567e2aE79CA692Bd748aB832081C45de4041eA',
  XOFm: '0x73F93dcc49cB8A239e2032663e9475dd5ef29A08',
  NGNm: '0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71',
  JPYm: '0xc45eCF20f3CD864B32D9794d6f76814aE8892e20',
  CHFm: '0xb55a79F398E759E43C95b979163f30eC87Ee131D',
  ZARm: '0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6',
  GBPm: '0xCCF663b1fF11028f0b19058d0f7B674004a40746',
  AUDm: '0x7175504C455076F15c04A2F90a8e352281F492F9',
  CADm: '0xff4Ab19391af240c311c54200a492233052B6325',
  GHSm: '0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313',
};

export const USDC_ADDRESS = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'; // Binance-Peg USDC on BSC (18 decimals)
export const USDT_ADDRESS = '0x55d398326f99059ff775485246999027b3197955'; // Binance-Peg USDT on BSC (18 decimals)
// WARNING: XAUT is NOT tradeable — excluded from TARGET_TOKENS and ALL_TOKEN_ADDRESSES until a real address is available
export const XAUT_ADDRESS = '0x0000000000000000000000000000000000000000';

// Non-stable tokens (for convert-to-USDC and yield flows)
export const NATIVE_TOKEN_ADDRESS = '0x471EcE3750Da237f93B8E339c536989b8978a438';
export const WETH_ADDRESS = '0x2170Ed0880ac9A755fd29B2688956BD959F933F8'; // Binance-Peg ETH on BSC
export const WBTC_ADDRESS = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'; // Binance-Peg BTC on BSC
export const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'; // WBNB on BSC
export const STAKED_TOKEN_ADDRESS = '0xC668583dcbDc9ae6FA3CE46462758188adfdfC24';

export const BASE_TOKEN_ADDRESSES: Record<BaseToken, string> = {
  USDC: USDC_ADDRESS,
  USDT: USDT_ADDRESS,
};

export const ALL_TOKEN_ADDRESSES: Record<string, string> = {
  ...STABLE_TOKEN_ADDRESSES,
  USDC: USDC_ADDRESS,
  USDT: USDT_ADDRESS,
  NATIVE: NATIVE_TOKEN_ADDRESS,
  WETH: WETH_ADDRESS,
  ETH: WETH_ADDRESS,
  WBTC: WBTC_ADDRESS,
  BTC: WBTC_ADDRESS,
  WBNB: WBNB_ADDRESS,
  BNB: WBNB_ADDRESS,
  stNATIVE: STAKED_TOKEN_ADDRESS,
};

export const TOKEN_METADATA: Record<
  string,
  { name: string; flag: string; decimals: number; logo?: string }
> = {
  USDm: { name: 'USD Stablecoin', flag: '🇺🇸', decimals: 18 },
  EURm: { name: 'Euro Stablecoin', flag: '🇪🇺', decimals: 18 },
  BRLm: { name: 'Brazilian Real', flag: '🇧🇷', decimals: 18 },
  KESm: { name: 'Kenyan Shilling', flag: '🇰🇪', decimals: 18 },
  PHPm: { name: 'Philippine Peso', flag: '🇵🇭', decimals: 18 },
  COPm: { name: 'Colombian Peso', flag: '🇨🇴', decimals: 18 },
  XOFm: { name: 'CFA Franc', flag: '🇸🇳', decimals: 18 },
  NGNm: { name: 'Nigerian Naira', flag: '🇳🇬', decimals: 18 },
  JPYm: { name: 'Japanese Yen', flag: '🇯🇵', decimals: 18 },
  CHFm: { name: 'Swiss Franc', flag: '🇨🇭', decimals: 18 },
  ZARm: { name: 'South African Rand', flag: '🇿🇦', decimals: 18 },
  GBPm: { name: 'British Pound', flag: '🇬🇧', decimals: 18 },
  AUDm: { name: 'Australian Dollar', flag: '🇦🇺', decimals: 18 },
  CADm: { name: 'Canadian Dollar', flag: '🇨🇦', decimals: 18 },
  GHSm: { name: 'Ghanaian Cedi', flag: '🇬🇭', decimals: 18 },
  USDC: { name: 'USD Coin', flag: '🇺🇸', decimals: 18 }, // Binance-Peg USDC on BSC
  USDT: { name: 'Tether USD', flag: '🇺🇸', decimals: 18 }, // Binance-Peg USDT on BSC
  XAUT: { name: 'Tether Gold', flag: '🥇', decimals: 6 },
  WMNT: { name: 'Wrapped Mantle', flag: '🔷', decimals: 18 },
  NATIVE: { name: 'Native Token', flag: '🌐', decimals: 18 },
  WETH: { name: 'Wrapped Ether', flag: 'Ξ', decimals: 18 },
  ETH: { name: 'Ethereum', flag: 'Ξ', decimals: 18 },
  WBTC: { name: 'Wrapped Bitcoin', flag: '₿', decimals: 18 },
  BTC: { name: 'Bitcoin', flag: '₿', decimals: 18 },
  WBNB: { name: 'Wrapped BNB', flag: '🔶', decimals: 18 },
  BNB: { name: 'BNB', flag: '🔶', decimals: 18 },
  stNATIVE: { name: 'Staked Token', flag: '🌐', decimals: 18 },
};

/** Get the number of decimals for a token symbol. */
export function getTokenDecimals(symbol: string): number {
  return TOKEN_METADATA[symbol]?.decimals ?? 18;
}

/** Resolve a token symbol to its on-chain address. Returns undefined if unknown. */
export function getTokenAddress(symbol: string): string | undefined {
  return ALL_TOKEN_ADDRESSES[symbol];
}

/** All tradeable target tokens (stablecoins only). */
export const TARGET_TOKENS = [...STABLE_TOKENS] as const; // XAUT excluded until real address available
export type TargetToken = (typeof TARGET_TOKENS)[number];
