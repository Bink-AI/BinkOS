export interface WalletBalance {
  symbol: string;
  balance: string;
  decimals: number;
  usdValue?: number;
  address?: string;
}

export interface WalletInfo {
  address: string;
  nativeBalance: WalletBalance;
  tokens: WalletBalance[];
  totalUsdValue?: number;
}

export interface IWalletProvider {
  getName(): string;
  getSupportedChains(): string[];
  getWalletInfo(address: string, chain: string): Promise<WalletInfo>;
  getNativeBalance(address: string, chain: string): Promise<WalletBalance>;
  getTokenBalances(address: string, chain: string): Promise<WalletBalance[]>;
  getTransactionCount(address: string, chain: string): Promise<number>;
}
