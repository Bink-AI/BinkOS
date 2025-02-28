import { NetworkName, Token } from '@binkai/core';

export interface WalletBalance {
  symbol: string;
  balance: string;
  decimals: number;
  name?: string;
  usdValue?: number;
  tokenAddress?: string;
}

export interface WalletInfo {
  address?: string;
  nativeBalance?: WalletBalance;
  tokens?: WalletBalance[];
  totalUsdValue?: number;
}

export interface TransferQuote {
  network: NetworkName;
  quoteId: string;
  token: Token;
  fromAddress: string;
  toAddress: string;
  amount: string;
  estimatedGas: string;
  tx?: Transaction;
}

export interface TransferParams {
  network: NetworkName;
  token: string;
  toAddress: string;
  amount: string;
}

export interface Transaction {
  to: string;
  data: string;
  value: string;
  gasLimit?: bigint;
  network: NetworkName;
}

export interface IWalletProvider {
  getName(): string;
  getSupportedNetworks(): NetworkName[];
  getWalletInfo(address: string, network: NetworkName): Promise<WalletInfo>;
  // getNativeBalance(address: string, chain: string): Promise<WalletBalance>;
  // getTokenBalances(address: string, chain: string): Promise<WalletBalance[]>;

  /**
   * Check if user has sufficient balance for the transfer
   * @param quote The transfer quote to check balance against
   * @param walletAddress The address of the user
   * @returns Promise<{ isValid: boolean; message?: string }> Returns if balance is sufficient and error message if not
   */
  checkBalance?: (
    quote: TransferQuote,
    walletAddress: string,
  ) => Promise<{ isValid: boolean; message?: string }>;

  /**
   * Get a quote for transferring tokens
   */
  getQuote?: (params: TransferParams, walletAddress: string) => Promise<TransferQuote>;

  /**
   * Build a transaction for transferring tokens
   * @param quote The quote to execute
   * @param walletAddress The address of the user who will execute the transfer
   */
  buildTransferTransaction?: (quote: TransferQuote, walletAddress: string) => Promise<Transaction>;

  /**
   * Build a transaction for approving token spending (for non-native tokens)
   * @param network The network to approve
   * @param tokenAddress The address of the token to approve
   * @param spender The address to approve spending for
   * @param amount The amount to approve
   * @param walletAddress The address of the user who will approve
   */
  buildApproveTransaction?: (
    network: NetworkName,
    tokenAddress: string,
    spender: string,
    amount: string,
    walletAddress: string,
  ) => Promise<Transaction>;

  /**
   * Check the allowance of a token for a spender
   * @param network The network to check
   * @param tokenAddress The address of the token to check
   * @param owner The owner of the tokens
   * @param spender The address to check allowance for
   */
  checkAllowance?: (
    network: NetworkName,
    tokenAddress: string,
    owner: string,
    spender: string,
  ) => Promise<bigint>;
}

export interface ITransferProvider {
  getName(): string;
  getSupportedNetworks(): NetworkName[];

  /**
   * Check if user has sufficient balance for the transfer
   * @param quote The transfer quote to check balance against
   * @param walletAddress The address of the user
   * @returns Promise<{ isValid: boolean; message?: string }> Returns if balance is sufficient and error message if not
   */
  checkBalance(
    quote: TransferQuote,
    walletAddress: string,
  ): Promise<{ isValid: boolean; message?: string }>;

  /**
   * Get a quote for transferring tokens
   */
  getQuote(params: TransferParams, walletAddress: string): Promise<TransferQuote>;

  /**
   * Build a transaction for transferring tokens
   * @param quote The quote to execute
   * @param walletAddress The address of the user who will execute the transfer
   */
  buildTransferTransaction(quote: TransferQuote, walletAddress: string): Promise<Transaction>;

  /**
   * Build a transaction for approving token spending (for non-native tokens)
   * @param network The network to approve
   * @param tokenAddress The address of the token to approve
   * @param spender The address to approve spending for
   * @param amount The amount to approve
   * @param walletAddress The address of the user who will approve
   */
  buildApproveTransaction(
    network: NetworkName,
    tokenAddress: string,
    spender: string,
    amount: string,
  ): Promise<Transaction>;

  /**
   * Check the allowance of a token for a spender
   * @param network The network to check
   * @param tokenAddress The address of the token to check
   * @param owner The owner of the tokens
   * @param spender The address to check allowance for
   */
  checkAllowance(
    network: NetworkName,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<bigint>;
}
