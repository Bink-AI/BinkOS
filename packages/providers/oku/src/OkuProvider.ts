import {
  SwapQuote,
  SwapParams,
  NetworkProvider,
  BaseSwapProvider,
  parseTokenAmount,
  Transaction,
  isSolanaNetwork,
} from '@binkai/swap-plugin';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';
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
  OKU_BNB_ADDRESS: '0x0000000000000000000000000000000000000000',
  OKU_API_PATH: 'https://canoe.v2.icarus.tools/market/zeroex/swap_quote',
  OKU_APPROVE_ADDRESS: '0x80EbA3855878739F4710233A8a19d89Bdd2ffB8E',
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
}

export class OkuProvider extends BaseSwapProvider {
  private chainId: ChainId;

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider);
    super(providerMap);
    this.chainId = chainId;
  }

  getName(): string {
    return 'oku';
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
      if (params.type === 'output') {
        throw new Error('OKU does not support output swaps');
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
          console.log(`🤖 OKu adjusted input amount from ${params.amount} to ${adjustedAmount}`);
        }
      }

      const tokenInAddress =
        tokenIn.address === CONSTANTS.BNB_ADDRESS ? CONSTANTS.OKU_BNB_ADDRESS : tokenIn.address;

      const tokenOutAddress =
        tokenOut.address === CONSTANTS.BNB_ADDRESS ? CONSTANTS.OKU_BNB_ADDRESS : tokenOut.address;

      const slippageOKU = Number(params.slippage) * 100 || 0.1;

      const headers = {
        'Content-Type': 'application/json',
      };
      const body = JSON.stringify({
        chain: 'bsc',
        account: userAddress,
        inTokenAddress: tokenInAddress,
        outTokenAddress: tokenOutAddress,
        isExactIn: true,
        slippage: slippageOKU,
        inTokenAmount: adjustedAmount.toString(),
      });
      const response = await fetch(CONSTANTS.OKU_API_PATH, {
        method: 'POST',
        headers,
        body,
      });

      const data = await response.json();
      console.log('Response:', data);
      if (!data || data.length === 0) {
        throw new Error('No data returned from OKU');
      }

      const inputAmount = data.inAmount;
      const outputAmount = data.outAmount;
      const estimatedGas = data.fees.gas;
      const priceImpact = 0;
      const tx = data.coupon.raw.quote.transaction;

      // Generate a unique quote ID
      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const quote: SwapQuote = {
        network: params.network,
        quoteId,
        fromToken: tokenIn,
        toToken: tokenOut,
        slippage: params.slippage,
        fromAmount: inputAmount,
        toAmount: outputAmount,
        priceImpact,
        route: ['oku'],
        estimatedGas: estimatedGas,
        type: params.type,
        tx: {
          to: tx?.to || '',
          data: tx?.data || '',
          value: tx?.value || '0',
          // gasLimit: BigInt(CONSTANTS.DEFAULT_GAS_LIMIT),
          network: params.network,
        },
      };
      console.log('log', quote);
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

  async buildApproveTransaction(
    network: NetworkName,
    token: string,
    spender: string,
    amount: string,
    walletAddress: string,
  ): Promise<Transaction> {
    this.validateNetwork(network);
    if (isSolanaNetwork(network)) {
      // TODO: Implement Solana
    }
    if (this.isNativeToken(token)) {
      throw new Error('Native token does not need approval');
    }

    const tokenInfo = await this.getToken(token, network);
    const erc20Interface = new Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    const data = erc20Interface.encodeFunctionData('approve', [
      CONSTANTS.OKU_APPROVE_ADDRESS,
      parseTokenAmount(amount, tokenInfo.decimals),
    ]);

    // Invalidate the native token balance cache since gas will be spent
    this.invalidateBalanceCache(EVM_NATIVE_TOKEN_ADDRESS, walletAddress, network);

    return {
      to: token,
      data,
      value: '0',
      network,
    };
  }
}
