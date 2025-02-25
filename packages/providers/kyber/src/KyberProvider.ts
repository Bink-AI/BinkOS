import { SwapQuote, SwapParams, BaseSwapProvider, NetworkProvider } from '@binkai/swap-plugin';
import { ethers, Provider } from 'ethers';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  KYBER_BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
  KYBER_API_BASE: 'https://aggregator-api.kyberswap.com/bsc/',
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
}

export class KyberProvider extends BaseSwapProvider {
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
    return 'kyber';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB];
  }
  // getPrompt(): string {
  //   return `If you are using KyberSwap, You can use BNB with address ${CONSTANTS.BNB_ADDRESS}`;
  // }

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

  // /**
  //  * Retrieves token information with caching and TTL
  //  * @param tokenAddress The address of the token
  //  * @returns Promise<Token>
  //  */
  // private async getToken(tokenAddress: string): Promise<Token> {
  //   const now = Date.now();
  //   const cached = this.tokenCache.get(tokenAddress);

  //   if (cached && now - cached.timestamp < this.CACHE_TTL) {
  //     return cached.token;
  //   }

  //   if (tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
  //     const token = {
  //       chainId: this.chainId,
  //       address: tokenAddress as `0x${string}`,
  //       decimals: 18,
  //       symbol: 'BNB',
  //     };
  //     this.tokenCache.set(tokenAddress, { token, timestamp: now });
  //     return token;
  //   }

  //   const info = await this.getTokenInfo(tokenAddress);
  //   console.log('🤖 Token info', info);
  //   const token = {
  //     chainId: info.chainId,
  //     address: info.address.toLowerCase() as `0x${string}`,
  //     decimals: info.decimals,
  //     symbol: info.symbol,
  //   };

  //   this.tokenCache.set(tokenAddress, { token, timestamp: now });
  //   return token;
  // }
  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      // Fetch input and output token information
      const [sourceToken, destinationToken] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);

      // Calculate input amount based on decimals
      const swapAmount =
        params.type === 'input'
          ? Math.floor(Number(params.amount) * 10 ** sourceToken.decimals)
          : undefined;

      // Fetch optimal swap route
      const optimalRoute = await this.fetchOptimalRoute(
        sourceToken.address,
        destinationToken.address,
        swapAmount,
      );

      // Build swap transaction
      const swapTransactionData = await this.buildSwapRouteTransaction(optimalRoute, userAddress);

      // Create and store quote
      const swapQuote = this.createSwapQuote(
        params,
        sourceToken,
        destinationToken,
        swapTransactionData,
        optimalRoute,
      );
      this.storeQuoteWithExpiry(swapQuote);
      console.log('log', swapQuote);
      return swapQuote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Helper methods for better separation of concerns
  private async fetchOptimalRoute(sourceToken: string, destinationToken: string, amount?: number) {
    const routePath = `api/v1/routes?tokenIn=${sourceToken}&tokenOut=${destinationToken}&amountIn=${amount}&gasInclude=true`;
    const routeResponse = await fetch(`${CONSTANTS.KYBER_API_BASE}${routePath}`);
    const routeData = await routeResponse.json();

    if (!routeData.data || routeData.data.length === 0) {
      throw new Error('No swap routes available from Kyber');
    }
    return routeData.data;
  }

  private async buildSwapRouteTransaction(routeData: any, userAddress: string) {
    const transactionResponse = await fetch(`${CONSTANTS.KYBER_API_BASE}api/v1/route/build`, {
      method: 'POST',
      body: JSON.stringify({
        routeSummary: routeData.routeSummary,
        sender: userAddress,
        recipient: userAddress,
        skipSimulateTx: false,
        slippageTolerance: 200,
      }),
    });
    return (await transactionResponse.json()).data;
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
      fromAmount: ethers.formatUnits(swapTransactionData.amountIn, sourceToken.decimals),
      toAmount: ethers.formatUnits(swapTransactionData.amountOut, destinationToken.decimals),
      slippage: 100, // 10% default slippage
      type: params.type,
      priceImpact: routeData.priceImpact || 0,
      route: ['kyber'],
      estimatedGas: CONSTANTS.DEFAULT_GAS_LIMIT,
      tx: {
        to: swapTransactionData.routerAddress,
        data: swapTransactionData.data,
        value: swapTransactionData.transactionValue || '0',
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
