import {
  SwapQuote,
  SwapParams,
  BaseSwapProvider,
  NetworkProvider,
  Transaction,
} from '@binkai/swap-plugin';
import { ethers, Provider } from 'ethers';
import { NetworkName, Token, logger } from '@binkai/core';
import { Hyperliquid } from './hyperliquid';

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  HYPERLIQUID_API_BASE: 'https://api.hyperliquid.xyz/exchange',
  USDC_ADDRESS: '0x6d1e7cde53ba9467b783cb7c530ce054',
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
  BASE = 8453,
  HYPERLIQUID = 999,
}

export class HyperliquidProvider extends BaseSwapProvider {
  private provider: Provider;
  private chainId: ChainId;

  constructor(provider: Provider, chainId: ChainId = ChainId.HYPERLIQUID) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    if (chainId === ChainId.HYPERLIQUID) {
      providerMap.set(NetworkName.HYPERLIQUID, provider);
    }

    super(providerMap);
    this.provider = provider;
    this.chainId = chainId;
  }

  getName(): string {
    return 'hyperliquid';
  }

  getSupportedChains(): string[] {
    return ['hyperliquid'];
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.HYPERLIQUID];
  }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === CONSTANTS.USDC_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    try {
      const token = await (
        await fetch(`https://api-ui.hyperliquid.xyz/info`, {
          method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'tokenDetails',
          tokenId: tokenAddress,
        }),
      })
    ).json();

    if (!token) {
      throw new Error('Token not found');
    }

    const tokenInfo = {
      chainId: this.chainId,
      address: tokenAddress,
      decimals: tokenAddress === CONSTANTS.USDC_ADDRESS ? 8 : token.weiDecimals,
      symbol: token.name,
      price: token.midPx,
      markPx: token.markPx,
        szDecimals: token.szDecimals,
      };
      return tokenInfo;
    } catch (error) {
      logger.error('Error getting token info:', error);
      throw new Error(
        `Failed to get token info: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      // check is valid limit order
      if (params?.limitPrice) {
        throw new Error('Hyperliquid does not support limit order for native token swaps');
      }
      // Fetch input and output token information
      const [fromToken, toToken] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);

      let adjustedAmount = params.amount;
      // if (params.type === 'input') {
      //   // Use the adjustAmount method for all tokens (both native and ERC20)
      //   adjustedAmount = await this.adjustAmount(
      //     params.fromToken,
      //     params.amount,
      //     userAddress,
      //     params.network,
      //   );

      if (adjustedAmount !== params.amount) {
        logger.info(
          `🤖 Hyperliquid adjusted input amount from ${params.amount} to ${adjustedAmount}`,
        );
      }

      // Calculate amountIn based on swap type
      let amountIn: string;
      let amountOut: string;
      if (params.type === 'input') {
        amountIn = adjustedAmount;
        amountOut = (
          (Number(adjustedAmount) * Number(fromToken.markPx)) /
          Number(toToken.markPx)
        ).toString();
      } else {
        // For output type, get reverse quote to calculate input amount
        amountOut = adjustedAmount;
        amountIn = (
          (Number(adjustedAmount) * Number(toToken.markPx)) /
          Number(fromToken.markPx)
        ).toString();
      }
      // Fetch swap transaction data from Hyperliquid API
      const swapTransactionData = {
        amountIn,
        amountOut,
      };

      // Create and store quote
      const swapQuote = this.createSwapQuote(params, fromToken, toToken, swapTransactionData);
      this.storeQuoteWithExpiry(swapQuote);
      return swapQuote;
    } catch (error: unknown) {
      logger.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async checkBalance(
    quote: SwapQuote,
    walletAddress: string,
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      return { isValid: true };
    } catch (error) {
      logger.error('Error checking balance:', error);
      return {
        isValid: false,
        message: `Failed to check balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private calculateOrderSize(amount: string, decimals: number | undefined): number {
    const szDecimals = decimals ?? 2; // Use nullish coalescing to default to 2 if undefined
    return Math.floor(Number(amount) * Math.pow(10, szDecimals)) / Math.pow(10, szDecimals);
  }

  private validateQuote(quote: SwapQuote): void {
    if (!quote.fromToken || !quote.toToken) {
      throw new Error('Invalid quote: missing token information');
    }
    if (!quote.fromAmount || !quote.toAmount) {
      throw new Error('Invalid quote: missing amount information');
    }
  }

  private createOrderRequest(
    tokenInfo: Token,
    isBuy: boolean,
    size: number,
    markPrice: number,
  ): any {
    return {
      coin: `${tokenInfo.symbol}-SPOT`,
      is_buy: isBuy,
      sz: size,
      limit_px: Number(markPrice),
      order_type: { limit: { tif: 'Gtc' } },
      reduce_only: false,
    };
  }

  async buildSendTransaction(quote: SwapQuote, pkWallet: string): Promise<Transaction> {
    try {
      // Validate quote
      this.validateQuote(quote);

      // Initialize SDK
      const testnet = false; // false for mainnet, true for testnet
      const sdk = new Hyperliquid(pkWallet, testnet);

      // Determine token and order direction
      const needToken =
        quote.fromToken.address === CONSTANTS.USDC_ADDRESS ? quote.toToken : quote.fromToken;
      const isBuy = needToken.address !== quote.fromToken.address;

      // Get token info with error handling
      const tokenInfo = await this.getToken(needToken.address, quote.network).catch(error => {
        logger.error('Failed to get token info:', error);
        throw new Error(`Failed to get token info: ${error.message}`);
      });

      // Calculate order size
      const amount = isBuy ? quote.toAmount : quote.fromAmount;
      const sz = this.calculateOrderSize(amount, tokenInfo.szDecimals);

      // Create and validate order request
      const orderRequest = this.createOrderRequest(tokenInfo, isBuy, sz, Number(tokenInfo.markPx));

      logger.info('Placing order with request:', orderRequest);

      // Place order with error handling
      const result = await sdk.exchange.placeOrder(orderRequest as any);

      if (!result?.response?.data?.statuses?.[0]) {
        throw new Error('Invalid response from Hyperliquid API');
      }

      const orderStatus = result.response.data.statuses[0];
      logger.info('Order status:', orderStatus);

      if (orderStatus.error) {
        throw new Error(`Order placement failed: ${orderStatus.error}`);
      }


      // Return transaction object
      return {
        to: quote.tx?.to || '',
        data: orderStatus?.resting?.oid || '',
        value: '0',
        spender: quote.tx?.spender || '',
        network: quote.network,
      };
    } catch (error) {
      logger.error('Error in buildSendTransaction:', error);
      throw new Error(
        `Failed to build transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Helper methods for better separation of concerns
  private createSwapQuote(
    params: SwapParams,
    sourceToken: Token,
    destinationToken: Token,
    swapTransactionData: any,
  ): SwapQuote {
    const quoteId = ethers.hexlify(ethers.randomBytes(32));

    return {
      quoteId,
      network: params.network,
      fromToken: sourceToken,
      toToken: destinationToken,
      fromAmount: swapTransactionData.amountIn,
      toAmount: swapTransactionData.amountOut,
      slippage: 100, // 10% default slippage
      type: params.type,
      priceImpact: 0,
      route: ['hyperliquid'],
      estimatedGas: CONSTANTS.DEFAULT_GAS_LIMIT,
      tx: {
        to: '',
        data: '0x',
        value: '0', // For native token swaps, this will be 0
        gasLimit: ethers.parseUnits(CONSTANTS.DEFAULT_GAS_LIMIT, 'wei'),
        network: params.network,
        spender: '',
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

  async findHyperLiquidToken(address: string, network: NetworkName): Promise<any> {
    try {
      const response = await fetch('https://api-ui.hyperliquid.xyz/info', {
        method: 'POST',
        headers: {
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Connection: 'keep-alive',
          'Content-Type': 'application/json',
          Origin: 'https://app.hyperliquid.xyz',
          Referer: 'https://app.hyperliquid.xyz/',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Linux"',
        },
        body: JSON.stringify({
          type: 'spotMeta',
        }),
      });

      const parseResponse = await response.json();
      const allTokens = parseResponse.tokens;

      const hyperTokenInfo = allTokens.find(
        (t: any) => t.tokenId?.toLowerCase() === address.toLowerCase(),
      );

      const tokenInfo = {
        address: hyperTokenInfo.tokenId || '',
        symbol: hyperTokenInfo.name,
        name: hyperTokenInfo.fullName || hyperTokenInfo.name,
        decimals: hyperTokenInfo.weiDecimals,
        network: network as NetworkName,
        index: hyperTokenInfo.index,
      };

      return tokenInfo;
    } catch (error) {
      console.error(`Error in findToken in  hyperliquid provider: ${error}`);
      throw error;
    }
  }
}
