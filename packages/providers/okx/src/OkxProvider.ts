import { SwapQuote, SwapParams, NetworkProvider, BaseSwapProvider } from '@binkai/swap-plugin';
import { ethers, Provider } from 'ethers';
import CryptoJS from 'crypto-js';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';

// Constants for better maintainability
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  OKX_BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
  OKX_APPROVE_ADDRESS: '0x2c34A2Fb1d0b4f55de51E1d0bDEfaDDce6b7cDD6',
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
}

export class OkxProvider extends BaseSwapProvider {
  private chainId: ChainId;
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly passphrase: string;
  private readonly projectId: string;
  protected GAS_BUFFER: bigint = ethers.parseEther('0.0003');

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider);

    super(providerMap);
    this.chainId = chainId;
    this.apiKey = process.env.OKX_API_KEY || '';
    this.secretKey = process.env.OKX_SECRET_KEY || '';
    this.passphrase = process.env.OKX_PASSPHRASE || '';
    this.projectId = process.env.OKX_PROJECT || '';
  }

  getName(): string {
    return 'okx';
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

  /**
   * Generates OKX API signature and headers
   * @param path API endpoint path
   * @param timestamp ISO timestamp
   * @returns Headers for OKX API request
   */
  private generateApiHeaders(path: string, timestamp: string): HeadersInit {
    const signature = CryptoJS.enc.Base64.stringify(
      CryptoJS.HmacSHA256(timestamp + 'GET' + path, this.secretKey),
    );

    return {
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
      'OK-ACCESS-PROJECT': this.projectId,
    };
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      if (params.type === 'output') {
        throw new Error('OKX does not support output swaps');
      }

      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);
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
          console.log(`🤖 Okx adjusted input amount from ${params.amount} to ${adjustedAmount}`);
        }
      }
      const amountIn =
        params.type === 'input'
          ? ethers.parseUnits(adjustedAmount, tokenIn.decimals)
          : ethers.parseUnits(adjustedAmount, tokenOut.decimals);

      const now = new Date();

      const isoString = now.toISOString();

      const slippageOKX = Number(params.slippage) / 100 || 0.1;

      const path = `/api/v5/dex/aggregator/swap?amount=${amountIn.toString()}&chainId=${this.chainId}&fromTokenAddress=${tokenIn.address}&toTokenAddress=${tokenOut.address}&slippage=${slippageOKX}&userWalletAddress=${userAddress}`;

      console.log('🤖 OKX Path', path);

      const headers = this.generateApiHeaders(path, isoString);

      const response = await fetch(`https://www.okx.com${path}`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!data.data || data.data.length === 0) {
        throw new Error('No data returned from OKX');
      }

      const inputAmount = data.data[0].routerResult.fromTokenAmount;
      const outputAmount = data.data[0].routerResult.toTokenAmount;
      const estimatedGas = data.data[0].routerResult.estimatedGas;
      const priceImpact = Number(data.data[0].routerResult.priceImpactPercentage);
      const tx = data.data[0].tx;

      // Generate a unique quote ID
      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const quote: SwapQuote = {
        network: params.network,
        quoteId,
        fromToken: tokenIn,
        toToken: tokenOut,
        slippage: params.slippage,
        fromAmount: ethers.formatUnits(inputAmount.toString(), tokenIn.decimals),
        toAmount: ethers.formatUnits(outputAmount.toString(), tokenOut.decimals),
        priceImpact,
        route: ['okx'],
        estimatedGas: estimatedGas,
        type: params.type,
        tx: {
          to: tx?.to || '',
          data: tx?.data || '',
          value: tx?.value || '0',
          gasLimit:
            ethers.parseUnits((tx.gas * 1.5).toString(), 'wei') ||
            ethers.parseUnits('350000', 'wei'),
          network: params.network,
        },
      };
      // Store the quote and trade for later use
      this.quotes.set(quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

      // Delete quote after 5 minutes
      setTimeout(() => {
        this.quotes.delete(quoteId);
      }, CONSTANTS.QUOTE_EXPIRY);

      return quote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
