import { ISwapProvider, SwapQuote, SwapParams } from '@binkai/swap-plugin';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { TokenManagerHelper2ABI } from './abis/TokenManagerHelper2';
// Enhanced interface with better type safety
interface TokenInfo extends Token {
  // Inherits all Token properties and maintains DRY principle
}

// Constants for better maintainability
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  FOUR_MEME_FACTORY_V3: '0xF251F83e40a78868FcfA3FA4599Dad6494E46034',
  FOUR_MEME_FACTORY_V2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
  BNB_ADDRESS: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
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

export class FourMemeProvider implements ISwapProvider {
  private provider: Provider;
  private chainId: ChainId;
  private factory: any;
  // Improved token caching with TTL
  private tokenCache: Map<string, { token: Token; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Enhanced quote storage with expiration
  private quotes: Map<string, { quote: SwapQuote; expiresAt: number }> = new Map();

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    this.provider = provider;
    this.chainId = chainId;
    this.factory = new Contract(
      CONSTANTS.FOUR_MEME_FACTORY_V2,
      TokenManagerHelper2ABI,
      this.provider,
    );
  }

  getName(): string {
    return 'four-meme';
  }

  getSupportedChains(): string[] {
    return ['bnb'];
  }

  getPrompt(): string {
    return `If you are using FourMeme, You can use BNB with address ${CONSTANTS.BNB_ADDRESS}`;
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

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      // Check if either fromToken or toToken is BNB
      if (
        params.fromToken.toLowerCase() !== CONSTANTS.BNB_ADDRESS.toLowerCase() &&
        params.toToken.toLowerCase() !== CONSTANTS.BNB_ADDRESS.toLowerCase()
      ) {
        throw new Error('One of the tokens must be BNB for FourMeme swaps');
      }

      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken),
        this.getToken(params.toToken),
      ]);

      const amountIn =
        params.type === 'input'
          ? ethers.parseUnits(params.amount, tokenIn.decimals)
          : ethers.parseUnits(params.amount, tokenOut.decimals);

      const needToken =
        tokenIn.address.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
          ? tokenOut.address
          : tokenIn.address;

      // Get token info from contract and convert to proper format
      const rawTokenInfo = await this.factory._tokenInfos(needToken);

      if (Number(rawTokenInfo.status) !== 0) {
        throw new Error('Token is not launched');
      }

      const tokenInfo = {
        base: rawTokenInfo.base,
        quote: rawTokenInfo.quote,
        template: rawTokenInfo.template,
        totalSupply: rawTokenInfo.totalSupply,
        maxOffers: rawTokenInfo.maxOffers,
        maxRaising: rawTokenInfo.maxRaising,
        launchTime: rawTokenInfo.launchTime,
        offers: rawTokenInfo.offers,
        funds: rawTokenInfo.funds,
        lastPrice: rawTokenInfo.lastPrice,
        K: rawTokenInfo.K,
        T: rawTokenInfo.T,
        status: rawTokenInfo.status,
      };

      let txData;
      let value = '0';
      let estimatedAmount = '0';
      let estimatedCost = '0';

      if (
        params.type === 'input' &&
        params.fromToken.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
      ) {
        // Calculate estimated output amount using calcBuyAmount
        const estimatedTokens = await this.factory.calcBuyAmount(tokenInfo, amountIn || 0n);
        estimatedAmount = estimatedTokens.toString();

        // Use the specific function signature for buyTokenAMAP with 3 parameters
        txData = this.factory.interface.encodeFunctionData(
          'buyTokenAMAP(address,uint256,uint256)',
          [
            params.toToken, // token to buy
            amountIn || 0n, // funds to spend
            0n, // minAmount (set to 0 for now - could add slippage protection)
          ],
        );
        value = amountIn?.toString() || '0';
        estimatedCost = amountIn?.toString() || '0';
      } else if (
        params.type === 'input' &&
        params.toToken.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
      ) {
        try {
          // For selling tokens, calculate estimated BNB output
          const estimatedBnb = await this.factory.calcSellCost(tokenInfo, amountIn || 0n);
          estimatedAmount = estimatedBnb.toString();

          // Use the specific function signature for sellToken with 2 parameters
          txData = this.factory.interface.encodeFunctionData('sellToken(address,uint256)', [
            params.fromToken,
            amountIn || 0n,
          ]);
          estimatedCost = '0';
        } catch (error) {
          console.error('Error calculating sell cost:', error);
          // Provide a fallback estimation based on current price
          if (tokenInfo.lastPrice && tokenInfo.lastPrice > 0n) {
            estimatedAmount = (
              ((amountIn || 0n) * tokenInfo.lastPrice) /
              ethers.parseUnits('1', 18)
            ).toString();
          } else {
            throw new Error('Unable to calculate sell price - insufficient liquidity');
          }
        }
      }

      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const quote: SwapQuote = {
        quoteId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromTokenDecimals: tokenIn.decimals,
        toTokenDecimals: tokenOut.decimals,
        slippage: 10,
        fromAmount: ethers.formatUnits(amountIn?.toString() || '0', tokenIn.decimals),
        toAmount: ethers.formatUnits(estimatedAmount, tokenOut.decimals),
        priceImpact: 0,
        route: ['four-meme'],
        estimatedGas: CONSTANTS.DEFAULT_GAS_LIMIT,
        type: params.type,
        tx: {
          to: CONSTANTS.FOUR_MEME_FACTORY_V2,
          data: txData,
          value,
          gasLimit: CONSTANTS.DEFAULT_GAS_LIMIT,
        },
      };

      this.quotes.set(quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

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
      spender,
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
    return await erc20.allowance(owner, spender);
  }
}
