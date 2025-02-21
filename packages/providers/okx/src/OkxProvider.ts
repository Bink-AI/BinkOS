import { ISwapProvider, SwapQuote, SwapResult, SwapParams } from '@binkai/swap-plugin';
import { ethers, Contract, Interface, Provider } from 'ethers';
import CryptoJS from 'crypto-js';

// Enhanced interface with better type safety
interface TokenInfo extends Token {
  // Inherits all Token properties and maintains DRY principle
}

// Constants for better maintainability
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  BNB_ADDRESS: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
  OKX_BNB_ADDRESS: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  OKX_APPROVE_ADDRESS: '0x2c34A2Fb1d0b4f55de51E1d0bDEfaDDce6b7cDD6',
} as const;

export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
}

export interface Token {
  address: `0x${string}`;
  decimals: number;
  symbol: string;
  chainId: number;
}

enum ChainId {
  BSC = 56,
  ETH = 1,
}

export class OkxProvider implements ISwapProvider {
  private provider: Provider;
  private chainId: ChainId;
  // Improved token caching with TTL
  private tokenCache: Map<string, { token: Token; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Enhanced quote storage with expiration
  private quotes: Map<string, { quote: SwapQuote; expiresAt: number }> = new Map();
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly passphrase: string;
  private readonly projectId: string;

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    this.provider = provider;
    this.chainId = chainId;
    this.apiKey = process.env.OKX_API_KEY || '';
    this.secretKey = process.env.OKX_SECRET_KEY || '';
    this.passphrase = process.env.OKX_PASSPHRASE || '';
    this.projectId = process.env.OKX_PROJECT || '';
  }

  getName(): string {
    return 'okx';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
  }

  getPrompt(): string {
    return `If you are using Okx, You can use BNB with address ${CONSTANTS.BNB_ADDRESS}`;
  }

  private async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const erc20Interface = new Interface([
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
    ]);

    const contract = new Contract(tokenAddress, erc20Interface, this.provider);
    const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);

    return {
      address: tokenAddress.toLowerCase() as `0x${string}`,
      decimals: Number(decimals),
      symbol,
      chainId: this.chainId,
    };
  }

  /**
   * Retrieves token information with caching and TTL
   * @param tokenAddress The address of the token
   * @returns Promise<Token>
   */
  private async getToken(tokenAddress: string): Promise<Token> {
    const now = Date.now();
    const cached = this.tokenCache.get(tokenAddress);

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.token;
    }

    const info = await this.getTokenInfo(tokenAddress);
    console.log('🤖 Token info', info);
    const token = {
      chainId: info.chainId,
      address: info.address.toLowerCase() as `0x${string}`,
      decimals: info.decimals,
      symbol: info.symbol,
    };

    this.tokenCache.set(tokenAddress, { token, timestamp: now });
    return token;
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
      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken),
        this.getToken(params.toToken),
      ]);

      const amountIn =
        params.type === 'input'
          ? Math.floor(Number(params.amount) * 10 ** tokenIn.decimals)
          : undefined;

      // Convert BNB addresses to OKX format
      const tokenInAddress =
        tokenIn.address === CONSTANTS.BNB_ADDRESS ? CONSTANTS.OKX_BNB_ADDRESS : tokenIn.address;
      const tokenOutAddress =
        tokenOut.address === CONSTANTS.BNB_ADDRESS ? CONSTANTS.OKX_BNB_ADDRESS : tokenOut.address;

      const now = new Date();

      const isoString = now.toISOString();

      const slippageOKX = Number(params.slippage) / 100 || 0.1;

      const path = `/api/v5/dex/aggregator/swap?amount=${amountIn}&chainId=${this.chainId}&fromTokenAddress=${tokenInAddress}&toTokenAddress=${tokenOutAddress}&slippage=${slippageOKX}&userWalletAddress=${userAddress}`;

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
        quoteId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromTokenDecimals: tokenIn.decimals,
        toTokenDecimals: tokenOut.decimals,
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
          gasLimit: (tx.gas * 1.5).toString() || '350000',
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

  async buildSwapTransaction(quote: SwapQuote, userAddress: string): Promise<SwapTransaction> {
    try {
      // Get the stored quote and trade
      const storedData = this.quotes.get(quote.quoteId);

      if (!storedData) {
        throw new Error('Quote expired or not found. Please get a new quote.');
      }

      return {
        to: storedData?.quote.tx?.to || '',
        data: storedData?.quote?.tx?.data || '',
        value: storedData?.quote?.tx?.value || '0',
        gasLimit: '350000',
      };
    } catch (error: unknown) {
      console.error('Error building swap transaction:', error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async buildApproveTransaction(
    token: string,
    spender: string,
    amount: string,
    userAddress: string,
  ): Promise<SwapTransaction> {
    const tokenInfo = await this.getToken(token);
    const erc20Interface = new Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    const data = erc20Interface.encodeFunctionData('approve', [
      CONSTANTS.OKX_APPROVE_ADDRESS,
      ethers.parseUnits(amount, tokenInfo.decimals),
    ]);

    return {
      to: token,
      data,
      value: '0',
      gasLimit: '100000',
    };
  }

  async checkAllowance(token: string, owner: string, spender: string): Promise<bigint> {
    const erc20 = new Contract(
      token,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      this.provider,
    );
    return await erc20.allowance(owner, CONSTANTS.OKX_APPROVE_ADDRESS);
  }
}
