import { SwapQuote, SwapParams, BaseSwapProvider, NetworkProvider } from '@binkai/swap-plugin';
import { ethers, Provider } from 'ethers';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
  THENA_BNB_ADDRESS: '0x0000000000000000000000000000000000000000',
  THENA_API_BASE: 'https://api.odos.xyz/sor/',
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
}

export class ThenaProvider extends BaseSwapProvider {
  private provider: Provider;
  private chainId: ChainId;
  protected GAS_BUFFER: bigint = ethers.parseEther('0.0003');

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider);

    super(providerMap);
    this.provider = provider;
    this.chainId = chainId;
  }

  getName(): string {
    return 'thena';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB];
  }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    if (this.isNativeToken(tokenAddress)) {
      return {
        address: tokenAddress as `0x${string}`,
        decimals: 18,
        symbol: 'BNB',
      };
    }

    const token = await super.getToken(tokenAddress, network);

    const tokenInfo = {
      chainId: this.chainId,
      address: token.address.toLowerCase() as `0x${string}`,
      decimals: token.decimals,
      symbol: token.symbol,
    };
    return tokenInfo;
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      // Fetch input and output token information
      const [sourceToken, destinationToken] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);
      const tokenInAddress =
        sourceToken.address === CONSTANTS.BNB_ADDRESS
          ? CONSTANTS.THENA_BNB_ADDRESS
          : sourceToken.address;

      const tokenOutAddress =
        destinationToken.address === CONSTANTS.BNB_ADDRESS
          ? CONSTANTS.THENA_BNB_ADDRESS
          : destinationToken.address;

      // Calculate input amount based on decimals
      let adjustedAmount = params.amount;
      if (params.type === 'input') {
        // Use the adjustAmount method for all tokens (both native and ERC20)
        adjustedAmount = await this.adjustAmount(
          params.fromToken,
          params.amount,
          userAddress,
          params.network,
        );

        if (adjustedAmount !== params.amount) {
          console.log(`🤖 OKu adjusted input amount from ${params.amount} to ${adjustedAmount}`);
        }
      }
      const amountIn =
        params.type === 'input'
          ? ethers.parseUnits(adjustedAmount, sourceToken.decimals)
          : ethers.parseUnits(adjustedAmount, destinationToken.decimals);

      // Fetch optimal swap route
      const optimalRoute = await this.fetchOptimalRoute(
        tokenInAddress,
        tokenOutAddress,
        userAddress,
        params.slippage,
        amountIn.toString(),
      );

      // Build swap transaction
      const swapTransactionData = await this.buildSwapRouteTransaction(optimalRoute, userAddress);

      if (!swapTransactionData) {
        throw new Error('No swap routes available from Thena');
      }

      // Create and store quote
      const swapQuote = this.createSwapQuote(
        params,
        sourceToken,
        destinationToken,
        swapTransactionData,
        optimalRoute,
      );
      this.storeQuoteWithExpiry(swapQuote);
      return swapQuote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Helper methods for better separation of concerns
  private async fetchOptimalRoute(
    sourceToken: string,
    destinationToken: string,
    userAddress: string,
    slippage: number,
    amount?: string,
  ) {
    const body = JSON.stringify({
      chainId: this.chainId,
      inputTokens: [
        {
          tokenAddress: sourceToken,
          amount: amount,
        },
      ],
      outputTokens: [
        {
          tokenAddress: destinationToken,
          proportion: 1,
        },
      ],
      userAddr: userAddress,
      slippageLimitPercent: slippage,
      pathVizImageConfig: {
        linkColors: ['#B386FF', '#FBA499', '#F9EC66', '#F199EE'],
        nodeColor: '#422D4C',
        nodeTextColor: '#D9D5DB',
        legendTextColor: '#FCE6FB',
        height: 300,
      },
    });

    const routeResponse = await fetch(`${CONSTANTS.THENA_API_BASE}quote/v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    });

    const routeData = await routeResponse.json();

    if (routeData.errorCode === 2000) {
      throw new Error('No swap routes available from Thena');
    }
    return routeData;
  }

  private async buildSwapRouteTransaction(routeData: any, userAddress: string) {
    const transactionResponse = await fetch(`${CONSTANTS.THENA_API_BASE}assemble`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userAddr: userAddress,
        pathId: routeData.pathId,
        simulate: true,
      }),
      redirect: 'follow',
    });
    return await transactionResponse.json();
  }

  private createSwapQuote(
    params: SwapParams,
    sourceToken: Token,
    destinationToken: Token,
    swapTransactionData: any,
    routeData: any,
  ): SwapQuote {
    const quoteId = ethers.hexlify(ethers.randomBytes(32));
    return {
      quoteId,
      network: params.network,
      fromToken: sourceToken,
      toToken: destinationToken,
      fromAmount: ethers.formatUnits(routeData.inAmounts[0], sourceToken.decimals),
      toAmount: ethers.formatUnits(routeData.outAmounts[0], destinationToken.decimals),
      slippage: 100, // 10% default slippage
      type: params.type,
      priceImpact: routeData.priceImpact || 0,
      route: ['thena'],
      estimatedGas: routeData.gasEstimateValue,
      tx: {
        to: swapTransactionData.transaction.to,
        data: swapTransactionData.transaction.data,
        value: swapTransactionData.transaction.value || '0',
        gasLimit: ethers.parseUnits(CONSTANTS.DEFAULT_GAS_LIMIT, 'wei'),
        network: params.network,
      },
    };
  }

  private storeQuoteWithExpiry(quote: SwapQuote) {
    this.quotes.set(quote.quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

    // Delete quote after expiry
    setTimeout(() => {
      this.quotes.delete(quote.quoteId);
    }, CONSTANTS.QUOTE_EXPIRY);
  }
}
