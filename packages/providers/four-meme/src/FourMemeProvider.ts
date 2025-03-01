import { SwapQuote, SwapParams } from '@binkai/swap-plugin';
import { ethers, Contract, Provider } from 'ethers';
import { TokenManagerHelper2ABI } from './abis/TokenManagerHelper2';
import { BaseSwapProvider, NetworkProvider } from '@binkai/swap-plugin';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';

// Constants for better maintainability
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  FOUR_MEME_FACTORY_V3: '0xF251F83e40a78868FcfA3FA4599Dad6494E46034',
  FOUR_MEME_FACTORY_V2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
  BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
}

export class FourMemeProvider extends BaseSwapProvider {
  private chainId: ChainId;
  private factory: any;
  protected GAS_BUFFER: bigint = ethers.parseEther('0.0003');

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider);

    super(providerMap);
    this.chainId = chainId;
    this.factory = new Contract(CONSTANTS.FOUR_MEME_FACTORY_V2, TokenManagerHelper2ABI, provider);
  }

  getName(): string {
    return 'four-meme';
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
          console.log(
            `🤖 FourMeme adjusted input amount from ${params.amount} to ${adjustedAmount}`,
          );
        }
      }
      const amountIn =
        params.type === 'input'
          ? ethers.parseUnits(adjustedAmount, tokenIn.decimals)
          : ethers.parseUnits(adjustedAmount, tokenOut.decimals);

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
        network: params.network,
        quoteId,
        fromToken: tokenIn,
        toToken: tokenOut,
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
          gasLimit: BigInt(CONSTANTS.DEFAULT_GAS_LIMIT),
          network: params.network,
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
}
