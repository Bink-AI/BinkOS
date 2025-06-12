import { SwapQuote, SwapParams, BaseSwapProvider, NetworkProvider } from '@binkai/swap-plugin';
import { ethers, Provider } from 'ethers';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token, logger } from '@binkai/core';

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  DODO_API_BASE: {
    [NetworkName.BNB]: 'https://api.dodoex.io/route-service/developer/',
    [NetworkName.BASE]: 'https://api.dodoex.io/route-service/developer/',
  },
  DODO_SPENDER: {
    [NetworkName.BNB]: '0xa128Ba44B2738A558A1fdC06d6303d52D3Cef8c1',
    [NetworkName.BASE]: '0xa128Ba44B2738A558A1fdC06d6303d52D3Cef8c1',
  },
} as const;

export enum ChainId {
  BNB = 56,
  BASE = 8453,
}

interface DodoProviderConfig {
  apiKey: string;
  provider: Provider;
  chainId: ChainId;
}

const PROVIDER_NAMES = {
  [ChainId.BNB]: 'dodo-bnb',
  [ChainId.BASE]: 'dodo-base',
} as const;

export class DodoProvider extends BaseSwapProvider {
  private provider: Provider;
  private chainId: ChainId;
  private readonly apiKey: string;
  protected GAS_BUFFER: bigint = ethers.parseEther('0.0003');

  constructor(config: DodoProviderConfig) {
    // Create a Map with network providers
    const providerMap = new Map<NetworkName, NetworkProvider>();

    // Always add both networks to the provider map
    providerMap.set(NetworkName.BNB, config.provider);
    providerMap.set(NetworkName.BASE, config.provider);

    super(providerMap);
    this.provider = config.provider;
    this.chainId = config.chainId;
    this.apiKey = config.apiKey || process.env.DODO_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('⚠️ Dodo API key not provided. Some features may not work correctly.');
    }
  }

  getName(): string {
    return PROVIDER_NAMES[this.chainId];
  }

  getSupportedChains(): string[] {
    return ['bnb', 'base'];
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB, NetworkName.BASE];
  }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    if (this.isNativeToken(tokenAddress)) {
      return {
        address: tokenAddress as `0x${string}`,
        decimals: 18,
        symbol: network === NetworkName.BASE ? 'ETH' : 'BNB',
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

  private async callDodoApi(
    amount: string,
    fromToken: Token,
    toToken: Token,
    userAddress: string,
    slippage: number = 1.5,
  ) {
    const network = this.chainId === ChainId.BASE ? NetworkName.BASE : NetworkName.BNB;
    const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes from now

    const queryParams = new URLSearchParams({
      apikey: this.apiKey,
      chainId: this.chainId.toString(),
      fromAmount: amount,
      fromTokenAddress: fromToken.address,
      toTokenAddress: toToken.address,
      slippage: slippage.toString(),
      userAddr: userAddress,
      deadLine: deadline.toString(),
      maxPriceImpact: '20',
    });

    const url = `${CONSTANTS.DODO_API_BASE[network]}swap?${queryParams.toString()}`;
    logger.info('🤖 Dodo API Path:', url);

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 200 || !data.data) {
      throw new Error('Failed to get quote from Dodo: ' + (data.message || 'Unknown error'));
    }

    return data.data;
  }

  private async getReverseQuote(
    amount: string,
    fromToken: Token,
    toToken: Token,
    userAddress: string,
  ): Promise<string> {
    // For Dodo, we'll use a simple price calculation based on the quote
    const result = await this.callDodoApi(amount, toToken, fromToken, userAddress);
    const pricePerFromToken = result.resPricePerFromToken;
    const outputAmount = Number(amount) * pricePerFromToken;
    return outputAmount.toString();
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      // Check if limit order is supported
      if (params?.limitPrice) {
        throw new Error('Dodo does not support limit orders');
      }

      // Fetch input and output token information
      const [sourceToken, destinationToken] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);

      let adjustedAmount = params.amount;
      if (params.type === 'input') {
        adjustedAmount = await this.adjustAmount(
          params.fromToken,
          params.amount,
          userAddress,
          params.network,
        );

        if (adjustedAmount !== params.amount) {
          logger.info(`🤖 Dodo adjusted input amount from ${params.amount} to ${adjustedAmount}`);
        }
      }

      // Calculate amountIn based on swap type
      let amountIn: string;
      if (params.type === 'input') {
        amountIn = ethers.parseUnits(adjustedAmount, sourceToken.decimals).toString();
      } else {
        // For output type, get reverse quote to calculate input amount
        const amountReverse = ethers.parseUnits('1', destinationToken.decimals).toString();
        const reverseAdjustedAmount = await this.getReverseQuote(
          amountReverse,
          sourceToken,
          destinationToken,
          userAddress,
        );
        const realAmount = Number(reverseAdjustedAmount) * Number(adjustedAmount);
        amountIn = ethers.parseUnits(realAmount.toString(), sourceToken.decimals).toString();
      }

      // Get swap route and transaction data
      const swapData = await this.callDodoApi(
        amountIn,
        sourceToken,
        destinationToken,
        userAddress,
        params.slippage || 1.5,
      );

      // Create and store quote
      const swapQuote = this.createSwapQuote(
        amountIn,
        params,
        sourceToken,
        destinationToken,
        swapData,
      );
      this.storeQuoteWithExpiry(swapQuote);
      return swapQuote;
    } catch (error: unknown) {
      logger.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private createSwapQuote(
    amountIn: string,
    params: SwapParams,
    sourceToken: Token,
    destinationToken: Token,
    swapData: any,
  ): SwapQuote {
    const quoteId = ethers.hexlify(ethers.randomBytes(32));

    return {
      quoteId,
      network: params.network,
      fromToken: sourceToken,
      toToken: destinationToken,
      fromAmount: ethers.formatUnits(amountIn, sourceToken.decimals),
      toAmount: swapData.resAmount,
      slippage: params.slippage || 1.5,
      type: params.type,
      priceImpact: swapData.priceImpact || 0,
      route: ['dodo'],
      estimatedGas: CONSTANTS.DEFAULT_GAS_LIMIT,
      tx: {
        to: swapData.to,
        data: swapData.data,
        value: swapData.value || '0',
        gasLimit: ethers.parseUnits(CONSTANTS.DEFAULT_GAS_LIMIT, 'wei'),
        network: params.network,
        spender: CONSTANTS.DODO_SPENDER[params.network as NetworkName.BNB | NetworkName.BASE],
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
