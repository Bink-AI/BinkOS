import { BaseBridgeProvider, parseTokenAmount } from '@binkai/bridge-plugin';

import { Provider, ethers, Contract, Interface } from 'ethers';
import axios from 'axios';
import { clusterApiUrl, Connection, VersionedTransaction } from '@solana/web3.js';
import {
  Addresses,
  ChainID,
  MAPPING_CHAIN_ID,
  MAPPING_TOKEN,
  MAPPING_TOKEN_TAKER,
  SupportedChain,
  SupportedToken,
  SupportedTokenTaker,
  TokenInfo,
  Tokens,
} from './utils';
import {
  EVM_NATIVE_TOKEN_ADDRESS,
  NetworkName,
  SOL_NATIVE_TOKEN_ADDRESS,
  SOL_NATIVE_TOKEN_ADDRESS2,
  Token,
} from '@binkai/core';
import { NetworkProvider } from '@binkai/bridge-plugin/src/BaseBridgeProvider';
import { BridgeQuote, Transaction } from '@binkai/bridge-plugin/src/types';
import { BridgeParams } from '@binkai/bridge-plugin/src/types';

export class deBridgeProvider extends BaseBridgeProvider {
  private fromChainId: ChainID;
  private toChainId: ChainID;
  constructor(
    provider: Provider,
    fromChainId: ChainID = ChainID.BNB,
    toChainId: ChainID = ChainID.SOLANA,
  ) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider);
    providerMap.set(NetworkName.SOLANA, new Connection(clusterApiUrl('mainnet-beta')));

    super(providerMap);
    this.fromChainId = fromChainId;
    this.toChainId = toChainId;
  }

  getName(): string {
    return 'deBridge';
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB, NetworkName.SOLANA];
  }

  // getPrompt(): string {
  //   return `If you are using deBridge, You can use BNB with address ${Tokens.BNB}, and you can use solana with address ${Tokens.SOL}`;
  // }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected isNativeSolana(tokenAddress: string): boolean {
    return (
      tokenAddress.toLowerCase() === SOL_NATIVE_TOKEN_ADDRESS.toLowerCase() ||
      tokenAddress.toLowerCase() === SOL_NATIVE_TOKEN_ADDRESS2.toLowerCase()
    );
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    if (this.isNativeToken(tokenAddress)) {
      return {
        address: tokenAddress as `0x${string}`,
        decimals: 18,
        symbol: 'BNB',
      };
    }

    if (this.isNativeSolana(tokenAddress)) {
      return {
        address: tokenAddress,
        decimals: 9,
        symbol: 'SOL',
      };
    }

    const token = await super.getToken(tokenAddress, network);

    const tokenInfo = {
      chainId: MAPPING_CHAIN_ID[network as SupportedChain],
      address:
        network === 'solana' ? token.address : (token.address.toLowerCase() as `0x${string}`),
      decimals: token.decimals,
      symbol: token.symbol,
    };
    return tokenInfo;
  }

  async getQuote(
    params: BridgeParams,
    fromWalletAddress: string,
    toWalletAddress: string,
  ): Promise<BridgeQuote> {
    try {
      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken, params.fromNetwork),
        this.getToken(params.toToken, params.toNetwork),
      ]);
      let adjustedAmount = params.amount;

      if (params.type === 'input') {
        // Use the adjustAmount method for all tokens (both native and ERC20)
        adjustedAmount = await this.adjustAmount(
          params.fromToken,
          params.amount,
          fromWalletAddress,
          params.fromNetwork,
        );

        if (adjustedAmount !== params.amount) {
          console.log(
            `🤖 deBridge adjusted input amount from ${params.amount} to ${adjustedAmount}`,
          );
        }
      }

      // build bridge data
      const bridgeData = await this.buildBridgeData(
        params,
        fromWalletAddress,
        toWalletAddress,
        tokenIn,
        tokenOut,
        adjustedAmount,
      );
      // calculate amount out
      // Generate a unique quote ID
      const quoteId = ethers.hexlify(ethers.randomBytes(32));
      const quote: BridgeQuote = {
        quoteId: quoteId,
        fromNetwork: params.fromNetwork,
        toNetwork: params.toNetwork,
        fromAmount:
          params.type === 'input'
            ? adjustedAmount
            : ethers.formatUnits(bridgeData?.amountOut || 0, tokenIn.decimals),
        toAmount:
          params.type === 'output'
            ? params.amount
            : ethers.formatUnits(bridgeData?.amountOut || 0, tokenOut.decimals),
        fromToken: tokenIn,
        toToken: tokenOut,
        type: params.type,
        priceImpact: 0,
        route: ['debridge'],
        tx: {
          to: bridgeData?.to || '',
          data: bridgeData?.data || '',
          value: bridgeData?.value || '0',
          gasLimit: bridgeData.gasLimit,
          network: params.fromNetwork,
        },
      };
      this.storeQuote(quote);
      return quote;
    } catch (e) {
      console.error('Error getting quote:', e);
      throw new Error(`Failed to get quote: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  private async buildBridgeData(
    params: BridgeParams,
    fromWalletAddress: string,
    toWalletAddress: string,
    tokenIn: Token,
    tokenOut: Token,
    adjustedAmount: string,
  ): Promise<Transaction> {
    console.log('🚀 ~ deBridgeProvider ~ buildBridgeData: ~ params:', params);

    const srcChainId = MAPPING_CHAIN_ID[params.fromNetwork as SupportedChain];
    const srcChainTokenIn =
      this.isNativeToken(params.fromToken) || this.isNativeSolana(params.fromToken)
        ? MAPPING_TOKEN[params.fromNetwork as SupportedToken]
        : params.fromToken; //params.fromNetwork === 'solana' ? Tokens.SOL : Tokens.BNB; // sol
    const srcChainTokenInAmount = parseTokenAmount(adjustedAmount, tokenIn.decimals);
    const dstChainId = MAPPING_CHAIN_ID[params.toNetwork as SupportedChain];
    const dstChainTokenOut =
      this.isNativeToken(params.toToken) || this.isNativeSolana(params.toToken)
        ? MAPPING_TOKEN[params.toNetwork as SupportedToken]
        : params.toToken;
    //params.toNetwork === 'bnb' ? Tokens.BNB : Tokens.SOL; // bnb

    const dstChainTokenOutRecipient = toWalletAddress;
    const senderAddress = fromWalletAddress;
    const srcChainOrderAuthorityAddress = senderAddress;
    const dstChainOrderAuthorityAddress = toWalletAddress;
    const srcChainRefundAddress = senderAddress;
    const allowedTaker = MAPPING_TOKEN_TAKER[params.fromNetwork as SupportedTokenTaker];
    //params.fromNetwork === 'solana' ? Addresses.allowedTakerSOL : Addresses.allowedTakerBNB; // default debridge

    console.log(
      '🚀 ~ deBridgeProvider ~ after data:',
      srcChainId,
      srcChainTokenIn,
      srcChainTokenInAmount,
      dstChainId,
      dstChainTokenOut,
      dstChainTokenOutRecipient,
      senderAddress,
      srcChainOrderAuthorityAddress,
      srcChainRefundAddress,
      allowedTaker,
    );

    const url = `https://deswap.debridge.finance/v1.0/dln/order/create-tx?srcChainId=${srcChainId}&srcChainTokenIn=${srcChainTokenIn}&srcChainTokenInAmount=${srcChainTokenInAmount}&dstChainId=${dstChainId}&dstChainTokenOut=${dstChainTokenOut}&dstChainTokenOutRecipient=${dstChainTokenOutRecipient}&senderAddress=${senderAddress}&srcChainOrderAuthorityAddress=${srcChainOrderAuthorityAddress}&srcChainRefundAddress=${srcChainRefundAddress}&dstChainOrderAuthorityAddress=${dstChainOrderAuthorityAddress}&enableEstimate=false&prependOperatingExpenses=true&additionalTakerRewardBps=0&allowedTaker=${allowedTaker}&deBridgeApp=DESWAP&ptp=false&tab=1739871311714`;

    const response = await axios.get(url);

    const data = response.data;
    let dataTx;
    if (params.fromNetwork === 'solana') {
      const connection = new Connection(clusterApiUrl('mainnet-beta'));
      const txBuffer = Buffer.from(data.tx.data.slice(2), 'hex');
      const versionedTx = VersionedTransaction.deserialize(txBuffer);
      // add blockhash to versionedTx
      const { blockhash } = await connection.getLatestBlockhash();
      versionedTx.message.recentBlockhash = blockhash;
      dataTx = Buffer.from(versionedTx.serialize()).toString('base64');
      // Update blockhash!
    } else {
      dataTx = data.tx.data;
    }

    return {
      to: params.fromNetwork === 'solana' ? dstChainTokenOutRecipient : data.tx.to,
      data: dataTx,
      value: params.fromNetwork === 'solana' ? srcChainTokenInAmount : data.tx.value,
      gasLimit: BigInt(700000), // solana not needed gas limit
      network: params.fromNetwork,
      amountOut: data?.estimation?.costsDetails[0]?.amountOut,
    };
  }

  async cleanup(): Promise<void> {
    return Promise.resolve();
  }
}
