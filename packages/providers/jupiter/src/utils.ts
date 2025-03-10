import { PublicKey } from '@solana/web3.js';

export type SwapMode = 'ExactIn' | 'ExactOut';

export interface TokenAmount {
  amount: string;
  decimals: number;
  uiAmount: number;
}

export interface JupiterQuoteParams {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  slippageBps?: number;
  swapMode?: SwapMode;
  dexes?: string[];
  excludeDexes?: string[];
  restrictIntermediateTokens?: boolean;
  onlyDirectRoutes?: boolean;
  asLegacyTransaction?: boolean;
  platformFeeBps?: number;
  maxAccounts?: number;
  autoSlippage?: boolean;
  maxAutoSlippageBps?: number;
  autoSlippageCollisionUsdValue?: number;
}

export interface SwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface RoutePlanStep {
  swapInfo: SwapInfo;
  percent: number;
}

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: SwapMode;
  slippageBps: number;
  priceImpactPct: number;
  routePlan: RoutePlanStep[];
  contextSlot?: number;
  timeTaken?: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  };
  computeUnits?: number;
  autoSlippageReport?: {
    computedAutoSlippage: number;
    maxAutoSlippageBps: number;
    autoSlippageCollisionUsdValue: number;
  };
  transaction: string;
  requestId: string;
}

export interface JupiterSwapParams {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
  wrapUnwrapSol?: boolean;
  useSharedAccounts?: boolean;
  feeAccount?: string;
  trackingAccount?: string;
  computeUnitPriceMicroLamports?: number;
  prioritizationFeeLamports?: number;
  asLegacyTransaction?: boolean;
  useTokenLedger?: boolean;
  destinationTokenAccount?: string;
  dynamicComputeUnitLimit?: boolean;
  skipUserAccountsRpcCalls?: boolean;
  dynamicSlippage?: {
    minBps: number;
    maxBps: number;
  };
  transaction: string;
  requestId: string;
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight?: number;
  dynamicSlippageReport?: {
    computedSlippageBps: number;
    simulationPriceImpactPct: number;
    simulationStatus: string;
  };
}

export interface JupiterError {
  error: string;
  message?: string;
  code?: number;
}

export type JupiterResponse<T> = T | JupiterError;

export interface JupiterSwapInstructionsParams extends Omit<JupiterSwapParams, 'quoteResponse'> {
  quoteResponse: JupiterQuoteResponse;
}

export interface JupiterSwapInstructionsResponse {
  tokenLedgerInstruction?: string;
  computeBudgetInstructions?: string[];
  setupInstructions?: string[];
  swapInstruction?: string;
  cleanupInstruction?: string;
  addressLookupTableAddresses?: string[];
}
