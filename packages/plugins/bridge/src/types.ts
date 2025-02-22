import { VersionedTransaction } from '@solana/web3.js';

export interface BridgeQuote {
  fromChain: string;
  wallet: string;
  toChain: string;
  walletReceive: string;
  fromToken: string;
  fromTokenDecimals: number;
  amount: string;
  toToken: string;
  toTokenDecimals: number;
  priceImpact: number;
  route: string[];
  type: 'input' | 'output';
}

export interface BridgeResult extends BridgeQuote {
  transactionHash: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface BridgeParams {
  fromChain: string;
  wallet: string;
  toChain: string;
  walletReceive: string;
  fromToken: string;
  toToken: string;
  amount: string;
  type: 'input' | 'output';
  slippage: number;
}

export interface BridgeTransaction {
  to: string;
  data: string;
  value: bigint;
  gasLimit: bigint;
}

export interface IBridgeProvider {
  /**
   * Get the name of the DEX provider
   */
  getName(): string;

  /**
   * Get supported chains for this provider
   */
  getSupportedChains(): string[];

  /**
   * Get the provider-specific prompt that helps guide the AI in using this provider effectively
   * This is optional - if not implemented, no special prompt will be used
   */
  getPrompt?(): string;

  /**
   * Get a quote for bridging tokens
   */
  getQuote(params: BridgeParams): Promise<BridgeQuote>;

  /**
   * Build a transaction for bridging tokens
   * @param quote The quote to execute
   * @param userAddress The address of the user who will execute the bridge
   */
  buildBridgeTransaction(quote: BridgeQuote, userAddress: string): Promise<BridgeTransaction>;
}
