import { BaseSwapProvider, NetworkProvider, SwapParams, SwapQuote } from '@binkai/swap-plugin';
import { NetworkName, SOL_NATIVE_TOKEN_ADDRESS, Token } from '@binkai/core';

import axios, { AxiosInstance, AxiosError } from 'axios';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
  JupiterError,
  JupiterQuoteParams,
  JupiterQuoteResponse,
  JupiterResponse,
  JupiterSwapParams,
  JupiterSwapResponse,
} from './utils';
import { Provider, ethers, Contract, Interface } from 'ethers';
const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

export class JupiterProvider extends BaseSwapProvider {
  private api: AxiosInstance;
  private static readonly DEFAULT_BASE_URL = 'https://quote-proxy.jup.ag';

  constructor(provider: Connection) {
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.SOLANA, new Connection(DEFAULT_SOLANA_RPC_URL));
    super(providerMap);
    this.api = axios.create({
      baseURL: JupiterProvider.DEFAULT_BASE_URL,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  getName(): string {
    return 'jupiter';
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.SOLANA];
  }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === SOL_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    if (this.isNativeToken(tokenAddress)) {
      return {
        address: 'So11111111111111111111111111111111111111112', // hardcoded solana native token address
        decimals: 9,
        symbol: 'SOL',
      };
    }

    const token = await super.getToken(tokenAddress, network);

    const tokenInfo = {
      chainId: 'solana',
      address: token.address,
      decimals: token.decimals,
      symbol: token.symbol,
    };
    return tokenInfo;
  }

  private handleError(error: unknown): JupiterError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<JupiterError>;
      return {
        error: axiosError.response?.data?.error || axiosError.message,
        message: axiosError.response?.data?.message,
        code: axiosError.response?.status,
      };
    }
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }

  async getSwapBuyAggregator(params: any, userPublicKey: string): Promise<JupiterSwapResponse> {
    const response = await this.api.post<JupiterSwapResponse>('/swap?swapType=aggregator', {
      addConsensusAccount: true,
      allowOptimizedWrappedSolTokenAccount: true,
      asLegacyTransaction: true,
      correctLastValidBlockHeight: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          global: false,
          maxLamports: 1000000,
          priorityLevel: 'veryHigh',
        },
      },
      quoteResponse: params,
      userPublicKey: userPublicKey,
      wrapAndUnwrapSol: true,
    });
    return response?.data;
  }

  async getSwapTransactions(params: any): Promise<JupiterResponse<JupiterSwapResponse>> {
    try {
      const response = await this.api.post<JupiterSwapResponse>('/swap', {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapUnwrapSol: params.wrapUnwrapSol,
        useSharedAccounts: params.useSharedAccounts,
        feeAccount: params.feeAccount,
        trackingAccount: params.trackingAccount,
        computeUnitPriceMicroLamports: params.computeUnitPriceMicroLamports,
        prioritizationFeeLamports: params.prioritizationFeeLamports,
        asLegacyTransaction: params.asLegacyTransaction,
        useTokenLedger: params.useTokenLedger,
        destinationTokenAccount: params.destinationTokenAccount,
        dynamicComputeUnitLimit: params.dynamicComputeUnitLimit,
        skipUserAccountsRpcCalls: params.skipUserAccountsRpcCalls,
        dynamicSlippage: params.dynamicSlippage,
      });

      return response.data;
    } catch (error) {
      console.log('🚀 ~ JupiterProvider ~ getSwapTransactions ~ error:', error);
      return this.handleError(error);
    }
  }

  async getQuoteJupiter(
    params: JupiterQuoteParams,
    userAddress: string,
  ): Promise<JupiterQuoteResponse> {
    try {
      const queryParams = {
        inputMint: params.inputMint.toString(),
        outputMint: params.outputMint.toString(),
        amount: params.amount,
        ...(params.slippageBps !== undefined && { slippageBps: params.slippageBps }),
        ...(params.swapMode && { swapMode: params.swapMode }),
        ...(params.dexes?.length && { dexes: params.dexes.join(',') }),
        ...(params.excludeDexes?.length && { excludeDexes: params.excludeDexes.join(',') }),
        ...(params.restrictIntermediateTokens !== undefined && {
          restrictIntermediateTokens: params.restrictIntermediateTokens,
        }),
        ...(params.onlyDirectRoutes !== undefined && { onlyDirectRoutes: params.onlyDirectRoutes }),
        ...(params.asLegacyTransaction !== undefined && {
          asLegacyTransaction: params.asLegacyTransaction,
        }),
        ...(params.platformFeeBps !== undefined && { platformFeeBps: params.platformFeeBps }),
        ...(params.maxAccounts !== undefined && { maxAccounts: params.maxAccounts }),
        ...(params.autoSlippage !== undefined && { autoSlippage: params.autoSlippage }),
        ...(params.maxAutoSlippageBps !== undefined && {
          maxAutoSlippageBps: params.maxAutoSlippageBps,
        }),
        ...(params.autoSlippageCollisionUsdValue !== undefined && {
          autoSlippageCollisionUsdValue: params.autoSlippageCollisionUsdValue,
        }),
      };

      const response = await this.api.get<JupiterQuoteResponse>('/quote', {
        params: queryParams,
      });

      return response.data;
    } catch (error) {
      throw new Error('Failed to get quote');
    }
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      const [sourceToken, destinationToken] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);

      console.log('🤖 sourceToken', sourceToken);
      console.log('🤖 destinationToken', destinationToken);

      let adjustedAmount = params.amount;
      if (params.type === 'input') {
        adjustedAmount = await this.adjustAmount(
          params.fromToken,
          params.amount,
          userAddress,
          params.network,
        );

        if (adjustedAmount !== params.amount) {
          console.log(
            `🤖 Jupiter adjusted input amount from ${params.amount} to ${adjustedAmount}`,
          );
        }
      }
      const swapData = await this.getQuoteJupiter(
        {
          inputMint: new PublicKey(sourceToken.address),
          outputMint: new PublicKey(destinationToken.address),
          amount: Number(ethers.parseUnits(params.amount, sourceToken.decimals)),
        },
        userAddress,
      );

      // build transaction
      const getSwapBuyAggregator = await this.getSwapBuyAggregator(swapData, userAddress);

      const quoteId = ethers.hexlify(ethers.randomBytes(32));
      const quote: SwapQuote = {
        quoteId: quoteId,
        fromToken: sourceToken,
        toToken: destinationToken,
        fromAmount: adjustedAmount,
        toAmount: swapData.outAmount,
        priceImpact: 0,
        route: [],
        estimatedGas: '',
        type: params.type,
        slippage: params.slippage,
        network: params.network,
        tx: {
          to: userAddress,
          spender: userAddress,
          data: getSwapBuyAggregator?.swapTransaction || '',
          value: ethers.parseUnits(adjustedAmount, sourceToken.decimals).toString(),
          network: params.network,
        },
      };
      this.storeQuote(quote);
      return quote;
    } catch (error: unknown) {
      //console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
