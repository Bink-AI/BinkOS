import { NetworkName } from '@binkai/core';

export interface WalletBalance {
  symbol: string;
  balance: string;
  decimals: number;
  name?: string;
  usdValue?: number;
  address?: string;
}

export interface WalletInfo {
  address: string;
  nativeBalance?: WalletBalance;
  tokens?: WalletBalance[];
  totalUsdValue?: number;
}

export interface IWalletProvider {
  getName(): string;
  getSupportedNetworks(): NetworkName[];
  getWalletInfo(address: string, network: NetworkName): Promise<WalletInfo>;
  // getNativeBalance(address: string, chain: string): Promise<WalletBalance>;
  // getTokenBalances(address: string, chain: string): Promise<WalletBalance[]>;
}
