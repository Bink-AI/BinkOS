import {
  BridgeParams,
  BridgeQuote,
  BridgeTransaction,
  IBridgeProvider,
} from '@binkai/bridge-plugin';
import { Provider } from 'ethers';
import axios from 'axios';
import { clusterApiUrl, Connection, VersionedTransaction } from '@solana/web3.js';
import { Addresses, ChainID, Tokens } from './utils';

export class deBridgeProvider implements IBridgeProvider {
  constructor(private provider: Provider) {
    this.provider = provider;
  }

  getName(): string {
    return 'deBridge';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'solana'];
  }

  getPrompt(): string {
    return `If you are using deBridge, You can use BNB with address ${Tokens.BNB}, and you can use solana with address ${Tokens.SOL}. Only bridge native token include BNB and SOL.`;
  }

  async getQuote(params: BridgeParams): Promise<BridgeQuote> {
    // Validate fromToken is native token
    if (
      (params.fromChain === 'bnb' && params.fromToken !== Tokens.BNB) ||
      (params.fromChain === 'solana' && params.fromToken !== Tokens.SOL)
    ) {
      throw new Error('Only native tokens (BNB and SOL) are supported as source tokens');
    }

    // Validate toToken is native token
    if (
      (params.toChain === 'bnb' && params.toToken !== Tokens.BNB) ||
      (params.toChain === 'solana' && params.toToken !== Tokens.SOL)
    ) {
      throw new Error('Only native tokens (BNB and SOL) are supported as destination tokens');
    }

    return Promise.resolve({
      amount: params.amount,
      fromChain: params.fromChain,
      toChain: params.toChain,
      fromToken: params.fromToken,
      fromTokenDecimals: params.fromChain === 'solana' ? 9 : 18,
      toToken: params.toToken,
      toTokenDecimals: params.toChain === 'solana' ? 9 : 18,
      type: params.type,
      slippage: 0,
      priceImpact: 0,
      route: [],
      estimatedGas: '0',
      wallet: params.wallet,
      walletReceive: params.walletReceive,
    });
  }

  async buildBridgeTransaction(
    quote: BridgeQuote,
    userAddress: string,
  ): Promise<BridgeTransaction> {
    const srcChainId = quote.fromChain === 'solana' ? ChainID.SOLANA : ChainID.BNB;
    const srcChainTokenIn = quote.fromChain === 'solana' ? Tokens.SOL : Tokens.BNB; // sol
    const srcChainTokenInAmount =
      quote.fromChain === 'solana'
        ? Number(quote.amount) * 10 ** 9
        : Number(quote.amount) * 10 ** 18;
    const dstChainId = quote.toChain === 'bnb' ? ChainID.BNB : ChainID.SOLANA;
    const dstChainTokenOut = quote.toChain === 'bnb' ? Tokens.BNB : Tokens.SOL; // bnb
    const dstChainTokenOutRecipient = quote.walletReceive;
    const senderAddress = quote.wallet;
    const srcChainOrderAuthorityAddress = senderAddress;
    const dstChainOrderAuthorityAddress = quote.walletReceive;
    const srcChainRefundAddress = senderAddress;
    const allowedTaker =
      quote.fromChain === 'solana' ? Addresses.allowedTakerSOL : Addresses.allowedTakerBNB; // default debridge
    const url = `https://deswap.debridge.finance/v1.0/dln/order/create-tx?srcChainId=${srcChainId}&srcChainTokenIn=${srcChainTokenIn}&srcChainTokenInAmount=${srcChainTokenInAmount}&dstChainId=${dstChainId}&dstChainTokenOut=${dstChainTokenOut}&dstChainTokenOutRecipient=${dstChainTokenOutRecipient}&senderAddress=${senderAddress}&srcChainOrderAuthorityAddress=${srcChainOrderAuthorityAddress}&srcChainRefundAddress=${srcChainRefundAddress}&dstChainOrderAuthorityAddress=${dstChainOrderAuthorityAddress}&enableEstimate=false&prependOperatingExpenses=true&additionalTakerRewardBps=0&allowedTaker=${allowedTaker}&deBridgeApp=DESWAP&ptp=false&tab=1739871311714`;

    const response = await axios.get(url);

    const data = response.data;
    let dataTx;
    if (quote.fromChain === 'solana') {
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
      to: quote.fromChain === 'solana' ? dstChainTokenOutRecipient : data.tx.to,
      data: dataTx,
      value: quote.fromChain === 'solana' ? BigInt(srcChainTokenInAmount) : BigInt(data.tx.value),
      gasLimit: BigInt(700000), // solana not needed gas limit
    };
  }

  async cleanup(): Promise<void> {
    return Promise.resolve();
  }
}
