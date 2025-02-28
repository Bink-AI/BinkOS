import { NetworkName } from '@binkai/core';
import { Connection, ParsedAccountData } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { ethers, Contract, Interface, Provider } from 'ethers';

export enum ChainID {
  ARBITRUM_ONE = 42161,
  AVALANCHE = 43114,
  BNB = 56,
  ETH = 1,
  POLYGON = 137,
  FANTOM = 250,
  SOLANA = 7565164,
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

//deBridgeContract: '0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251',

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  chainId: number;
}

export const getTokenInfoSolana = async (tokenAddress: string, rpc: string): Promise<TokenInfo> => {
  // For native SOL
  if (tokenAddress === Tokens.SOL) {
    return {
      address: tokenAddress,
      decimals: 9,
      symbol: 'SOL',
      chainId: ChainID.SOLANA,
    };
  }

  // For other SPL tokens
  const connection = new Connection(rpc);
  const mint = new PublicKey(tokenAddress);
  try {
    const mintInfo = await connection.getParsedAccountInfo(mint);
    if (!mintInfo.value || !mintInfo.value.data) {
      throw new Error('Failed to fetch token mint info');
    }
    const parsedData = mintInfo.value.data as ParsedAccountData;
    return {
      address: tokenAddress,
      decimals: parsedData.parsed.info.decimals,
      symbol: parsedData.parsed.info.symbol,
      chainId: ChainID.SOLANA,
    };
  } catch (error) {
    console.error('Error fetching Solana token decimals:', error);
    throw new Error(`Failed to get decimals for token ${tokenAddress}`);
  }
};

export const getTokenInfoEVM = async (
  tokenAddress: string,
  rpc: string,
  chainId: number,
): Promise<TokenInfo> => {
  const provider = new ethers.JsonRpcProvider(rpc);

  const erc20Interface = new Interface([
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ]);

  const contract = new Contract(tokenAddress, erc20Interface, provider);
  const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);

  return {
    address: tokenAddress.toLowerCase() as `0x${string}`,
    decimals: Number(decimals),
    symbol,
    chainId: chainId,
  };
};
