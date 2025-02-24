import { IStakingProvider, StakingParams, StakingQuote } from '@binkai/staking-plugin';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { VenusPoolABI } from './abis/VenusPool';
import { EVM_NATIVE_TOKEN_ADDRESS } from '@binkai/core';
// Enhanced interface with better type safety
interface TokenInfo extends Token {
  // Inherits all Token properties and maintains DRY principle
}

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
  VENUS_API_BASE: 'https://api.venus.io/',
  VENUS_POOL_ADDRESS: '0xa07c5b74c9b40447a954e1466938b865b6bbea36',
} as const;

export interface Transaction {
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

// Add these interfaces before the VenusProvider class

interface VenusPoolsResponse {
  limit: number;
  page: number;
  total: number;
  result: VenusPool[];
}

interface VenusPool {
  address: string;
  chainId: string;
  name: string;
  description: string | null;
  priceOracleAddress: string;
  closeFactorMantissa: string;
  liquidationIncentiveMantissa: string;
  minLiquidatableCollateralMantissa: string;
  markets: VenusMarket[];
}

interface VenusMarket {
  address: string;
  chainId: string;
  symbol: string;
  name: string;
  underlyingAddress: string;
  underlyingName: string;
  underlyingSymbol: string;
  underlyingDecimal: number;

  // Interest rates
  borrowRatePerBlock: string;
  supplyRatePerBlock: string;
  borrowApy: string;
  supplyApy: string;

  // Market state
  exchangeRateMantissa: string;
  underlyingPriceMantissa: string;
  totalBorrowsMantissa: string;
  totalSupplyMantissa: string;
  cashMantissa: string;
  totalReservesMantissa: string;

  // Configuration
  reserveFactorMantissa: string;
  collateralFactorMantissa: string;
  supplyCapsMantissa: string;
  borrowCapsMantissa: string;

  // Market metrics
  borrowerCount: number;
  supplierCount: number;
  liquidityCents: string;
  tokenPriceCents: string;

  // Status
  pausedActionsBitmap: number;
  isListed: boolean;

  // Rewards
  rewardsDistributors: RewardDistributor[];
}

interface RewardDistributor {
  id: string;
  marketAddress: string;
  rewardTokenAddress: string;
  chainId: string;
  supplySpeed: string;
  borrowSpeed: string;
  priceMantissa: string;
  rewardType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class VenusProvider implements IStakingProvider {
  private provider: Provider;
  private chainId: ChainId;
  private factory: any;

  // Token cache with expiration time
  private tokenCache: Map<string, { token: Token; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Quote storage with expiration
  private quotes: Map<string, { quote: StakingQuote; expiresAt: number }> = new Map();

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    this.provider = provider;
    this.chainId = chainId;
    this.factory = new Contract(CONSTANTS.VENUS_POOL_ADDRESS, VenusPoolABI, this.provider);
  }

  getName(): string {
    return 'venus';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
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

    if (tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      const token = {
        chainId: this.chainId,
        address: tokenAddress as `0x${string}`,
        decimals: 18,
        symbol: 'BNB',
      };
      this.tokenCache.set(tokenAddress, { token, timestamp: now });
      return token;
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

  async getQuote(params: StakingParams, userAddress: string): Promise<StakingQuote> {
    try {
      if (params.fromToken.toLowerCase() !== CONSTANTS.BNB_ADDRESS.toLowerCase()) {
        throw new Error('Venus does not support this token');
      }
      // Fetch input and output token information
      const sourceToken = await this.getToken(params.fromToken);

      // Calculate input amount based on decimals
      const swapAmount = BigInt(Math.floor(Number(params.amount) * 10 ** sourceToken.decimals));

      // Fetch optimal swap route
      const optimalRoute: VenusMarket = await this.fetchOptimalRoute(CONSTANTS.VENUS_POOL_ADDRESS);

      // Build swap transaction
      const buildTransactionData = await this.buildStakingRouteTransaction(
        optimalRoute,
        swapAmount,
        params.type,
      );

      // Create and store quote
      const quote = this.createQuote(params, sourceToken, optimalRoute, buildTransactionData);

      this.storeQuoteWithExpiry(quote);

      return quote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Helper methods for better separation of concerns
  private async fetchOptimalRoute(poolAddress: string): Promise<VenusMarket> {
    const routePath = `pools?chainId=56`;
    const routeResponse = await fetch(`${CONSTANTS.VENUS_API_BASE}${routePath}`);
    const routeData = (await routeResponse.json()) as VenusPoolsResponse;

    if (!routeData.result || routeData.result.length === 0) {
      throw new Error('No pools available from Venus');
    }

    // First find the Core Pool
    const corePool = routeData.result.find((pool: VenusPool) => pool.name === 'Core Pool');

    if (!corePool) {
      throw new Error('Core Pool not found');
    }

    // Then find the specific market within the Core Pool's markets
    const targetMarket = corePool.markets.find(
      (market: VenusMarket) => market.address.toLowerCase() === poolAddress.toLowerCase(),
    );

    if (!targetMarket) {
      throw new Error(`Market with address ${poolAddress} not found in Venus`);
    }

    return targetMarket;
  }

  private async buildStakingRouteTransaction(
    routeData: VenusMarket,
    amount: bigint,
    type: 'stake' | 'unstake' | 'supply' | 'withdraw' = 'stake',
  ) {
    try {
      let txData: string;

      // Handle staking/supply
      if (type === 'stake' || type === 'supply') {
        txData = this.factory.interface.encodeFunctionData('mint', []);

        return {
          to: routeData.address,
          data: txData,
          value: amount.toString(), // For BNB, the value field is used
          gasLimit: CONSTANTS.DEFAULT_GAS_LIMIT,
        };
      }
      // Handle unstaking/withdraw
      else {
        txData = this.factory.interface.encodeFunctionData('redeemUnderlying', [amount]);

        return {
          to: routeData.address,
          data: txData,
          value: '0', // No value needed for redeem
          gasLimit: CONSTANTS.DEFAULT_GAS_LIMIT,
        };
      }
    } catch (error) {
      console.error('Error building staking transaction:', error);
      throw new Error(
        `Failed to build staking transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private createQuote(
    params: StakingParams,
    sourceToken: Token,
    swapTransactionData: any,
    buildTransactionData: any,
  ): StakingQuote {
    const quoteId = ethers.hexlify(ethers.randomBytes(32));

    return {
      quoteId,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.amount,
      toAmount: params.amount,
      fromTokenDecimals: sourceToken.decimals,
      toTokenDecimals: sourceToken.decimals,
      type: params.type,
      currentAPY: Number(swapTransactionData.supplyApy),
      averageAPY: Number(swapTransactionData.supplyApy),
      maxSupply: Number(swapTransactionData.supplyCapsMantissa),
      currentSupply: Number(swapTransactionData.totalSupplyMantissa),
      liquidity: Number(swapTransactionData.liquidityCents),
      estimatedGas: CONSTANTS.DEFAULT_GAS_LIMIT,
      tx: {
        to: buildTransactionData.to,
        data: buildTransactionData.data,
        value: buildTransactionData.value,
        gasLimit: buildTransactionData.gasLimit,
      },
    };
  }

  private storeQuoteWithExpiry(quote: StakingQuote) {
    this.quotes.set(quote.quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

    // Delete quote after expiry
    setTimeout(() => {
      this.quotes.delete(quote.quoteId);
    }, CONSTANTS.QUOTE_EXPIRY);
  }

  async buildStakingTransaction(quote: StakingQuote, userAddress: string): Promise<Transaction> {
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
  ): Promise<Transaction> {
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
    if (token.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      return BigInt(Number.MAX_SAFE_INTEGER) * BigInt(10 ** 18);
    }
    const erc20 = new Contract(
      token,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      this.provider,
    );
    return await erc20.allowance(owner, spender);
  }
}
