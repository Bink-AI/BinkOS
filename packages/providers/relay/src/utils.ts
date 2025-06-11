import { NetworkName } from '@binkai/core';

export enum ChainID {
  ARBITRUM_ONE = 42161,
  AVALANCHE = 43114,
  BNB = 56,
  ETH = 1,
  POLYGON = 137,
  FANTOM = 250,
  SOLANA = 792703809,
  LINEA = 59144,
  OPTIMISM = 10,
  BASE = 8453,
  NEON = 245022934,
  GNOSIS = 100,
  LIGHTLINK = 1890,
  METIS = 1088,
  BITROCK = 7171,
  SONIC = 146,
  CROSSFI = 4158,
  CRONOSZK = 388,
  ABSTRACT = 2741,
  BERACHAIN = 80094,
  STORY = 1514,
  HYPEREVM = 999,
}

export const MAPPING_CHAIN_ID = {
  [NetworkName.SOLANA]: ChainID.SOLANA,
  [NetworkName.ETHEREUM]: ChainID.ETH,
  [NetworkName.BNB]: ChainID.BNB,
  [NetworkName.POLYGON]: ChainID.POLYGON,
  [NetworkName.ARBITRUM]: ChainID.ARBITRUM_ONE,
  [NetworkName.OPTIMISM]: ChainID.OPTIMISM,
  // Add more chains as they become supported
} as const;
export type SupportedChain = keyof typeof MAPPING_CHAIN_ID;

export const Tokens = {
  SOL: '11111111111111111111111111111111',
  BNB: '0x0000000000000000000000000000000000000000',
};

export const MAPPING_TOKEN = {
  [NetworkName.SOLANA]: Tokens.SOL,
  [NetworkName.BNB]: Tokens.BNB,
} as const;
export type SupportedToken = keyof typeof MAPPING_TOKEN;

export const Addresses = {
  allowedTakerSOL: '0x555CE236C0220695b68341bc48C68d52210cC35b',
  allowedTakerBNB: '2snHHreXbpJ7UwZxPe37gnUNf7Wx7wv6UKDSR2JckKuS',
};

export const MAPPING_TOKEN_TAKER = {
  [NetworkName.SOLANA]: Addresses.allowedTakerSOL,
  [NetworkName.BNB]: Addresses.allowedTakerBNB,
} as const;
export type SupportedTokenTaker = keyof typeof MAPPING_TOKEN_TAKER;

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  chainId: number;
}

// Add type definitions for Relay API
export interface RelayQuoteRequest {
  user: string;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
  recipient: string;
  tradeType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  amount: string;
  referrer: string;
  useExternalLiquidity: boolean;
  useDepositAddress: boolean;
  topupGas: boolean;
}

export interface RelayQuoteResponse {
  steps: Array<{
    items: Array<{
      data: {
        from: string;
        to: string;
        data: string;
        value: string;
        chainId: number;
        gas: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
        // Solana specific fields
        instructions?: Array<{
          programId: string;
          keys: Array<{
            pubkey: string;
            isSigner: boolean;
            isWritable: boolean;
          }>;
          data: string;
        }>;
        addressLookupTableAddresses?: string[];
      };
    }>;
  }>;
  details?: {
    currencyOut?: {
      amount: string;
    };
  };
}
