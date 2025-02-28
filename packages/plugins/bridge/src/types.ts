import { NetworkName, Token } from '@binkai/core';
import { Provider } from 'ethers';
import { Connection } from '@solana/web3.js';

export type NetworkProvider = Provider | Connection;

export interface BridgeQuote {
  quoteId: string;
  fromNetwork: NetworkName;
  toNetwork: NetworkName;
  fromToken: Token;
  fromAmount: string;
  toAmount: string;
  toToken: Token;
  priceImpact: number;
  route: string[];
  type: 'input' | 'output';
  tx?: Transaction;
}

export interface BridgeResult extends BridgeQuote {
  transactionHash: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface BridgeParams {
  fromNetwork: NetworkName;
  toNetwork: NetworkName;
  fromToken: string;
  toToken: string;
  amount: string;
  type: 'input' | 'output';
}

export interface BasicToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface Transaction {
  to: string;
  data: string;
  value?: string;
  gasLimit?: bigint;
  network: NetworkName;
  amountOut?: string;
}

export interface IBridgeProvider {
  /**
   * Get the name of the DEX provider
   */
  getName(): string;

  /**
   * Get supported networks for this provider
   */
  getSupportedNetworks(): NetworkName[];

  /**
   * Get the provider-specific prompt that helps guide the AI in using this provider effectively
   * This is optional - if not implemented, no special prompt will be used
   */
  getPrompt?(): string;

  /**
   * Check if user has sufficient balance for the bridge
   * @param quote The bridge quote to check balance against
   * @param walletAddress The address of the user
   * @returns Promise<{ isValid: boolean; message?: string }> Returns if balance is sufficient and error message if not
   */
  checkBalance(
    quote: BridgeQuote,
    walletAddress: string,
  ): Promise<{ isValid: boolean; message?: string }>;

  /**
   * Adjusts a token amount based on user's balance to handle precision issues
   * @param tokenAddress The address of the token to adjust
   * @param amount The requested amount
   * @param walletAddress The user's wallet address
   * @param network The blockchain network
   * @returns The adjusted amount that can be safely used
   */
  adjustAmount(
    tokenAddress: string,
    amount: string,
    walletAddress: string,
    network: NetworkName,
  ): Promise<string>;

  /**
   * Invalidates the balance cache for a specific token and wallet
   * @param tokenAddress The address of the token
   * @param walletAddress The address of the wallet
   * @param network The blockchain network
   */
  invalidateBalanceCache(tokenAddress: string, walletAddress: string, network: NetworkName): void;

  /**
   * Get a quote for bridging tokens
   */
  getQuote(
    params: BridgeParams,
    fromWalletAddress: string,
    toWalletAddress: string,
  ): Promise<BridgeQuote>;

  /**
   * Build a transaction for bridging tokens
   * @param quote The quote to execute
   * @param fromWalletAddress The address of the user who will send the tokens
   * @param toWalletAddress The address of the user who will receive the tokens
   */
  buildBridgeTransaction(
    quote: BridgeQuote,
    fromWalletAddress: string,
    toWalletAddress: string,
  ): Promise<Transaction>;
}
