export interface StakingQuote {
  quoteId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  fromTokenDecimals: number;
  toTokenDecimals: number;
  currentAPY: number;
  averageAPY?: number;
  maxSupply: number;
  currentSupply: number;
  liquidity: number;
  estimatedGas: string;
  type: 'supply' | 'withdraw' | 'stake' | 'unstake';
  tx?: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
}

export interface StakingResult extends StakingQuote {
  transactionHash: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface StakingParams {
  fromToken: string;
  toToken: string;
  amount: string;
  type: 'supply' | 'withdraw' | 'stake' | 'unstake';
}

export interface StakingTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
}

export interface IStakingProvider {
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
   * Get a quote for swapping tokens
   */
  getQuote(params: StakingParams, userAddress: string): Promise<StakingQuote>;

  /**
   * Build a transaction for swapping tokens
   * @param quote The quote to execute
   * @param userAddress The address of the user who will execute the swap
   */
  buildStakingTransaction(quote: StakingQuote, userAddress: string): Promise<StakingTransaction>;

  /**
   * Build a transaction for approving token spending
   * @param token The token to approve
   * @param spender The address to approve spending for
   * @param amount The amount to approve
   * @param userAddress The address of the user who will approve
   */
  buildApproveTransaction(
    token: string,
    spender: string,
    amount: string,
    userAddress: string,
  ): Promise<StakingTransaction>;

  /**
   * Check the allowance of a token for a spender
   * @param token The token to check
   * @param owner The owner of the tokens
   * @param spender The address to check allowance for
   */
  checkAllowance(token: string, owner: string, spender: string): Promise<bigint>;
}
