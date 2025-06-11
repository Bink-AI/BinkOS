import { BaseBridgeProvider, parseTokenAmount } from '@binkai/bridge-plugin';
import { Provider, ethers } from 'ethers';
import axios, { AxiosError } from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  ChainID,
  MAPPING_CHAIN_ID,
  MAPPING_TOKEN,
  RelayQuoteRequest,
  RelayQuoteResponse,
  SupportedChain,
  SupportedToken,
} from './utils';
import {
  EVM_NATIVE_TOKEN_ADDRESS,
  NetworkName,
  SOL_NATIVE_TOKEN_ADDRESS,
  SOL_NATIVE_TOKEN_ADDRESS2,
  Token,
  logger,
} from '@binkai/core';
import { NetworkProvider } from '@binkai/bridge-plugin/src/BaseBridgeProvider';
import { BridgeQuote, Transaction } from '@binkai/bridge-plugin/src/types';
import { BridgeParams } from '@binkai/bridge-plugin/src/types';
import * as anchor from '@coral-xyz/anchor';
import { sign } from 'crypto';

// Add constants
const RELAY_API_CONFIG = {
  BASE_URL: 'https://api.relay.link',
  ENDPOINTS: {
    QUOTE: '/quote',
  },
  HEADERS: {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    origin: 'https://www.relay.link',
  },
  DEFAULT_REFERRER: 'relay.link',
  DEFAULT_GAS_LIMIT: BigInt(700000),
} as const;

export class RelayProvider extends BaseBridgeProvider {
  private fromChainId: ChainID;
  private toChainId: ChainID;
  constructor(
    provider: [Provider, Connection],
    fromChainId: ChainID = ChainID.BNB,
    toChainId: ChainID = ChainID.SOLANA,
  ) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider[0]);
    providerMap.set(NetworkName.SOLANA, provider[1]);

    super(providerMap);
    this.fromChainId = fromChainId;
    this.toChainId = toChainId;
  }

  getName(): string {
    return 'relay';
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB, NetworkName.SOLANA];
  }

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
        this.getToken(
          params.type === 'input' ? params.fromToken : params.toToken,
          params.fromNetwork,
        ),
        this.getToken(
          params.type === 'input' ? params.toToken : params.fromToken,
          params.toNetwork,
        ),
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
          logger.info(`🤖 relay adjusted input amount from ${params.amount} to ${adjustedAmount}`);
        }
      }

      const bridgeData = await this.buildBridgeData(
        params,
        fromWalletAddress,
        toWalletAddress,
        tokenIn,
        tokenOut,
        adjustedAmount,
      );

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
            ? parseTokenAmount(params.amount, tokenOut.decimals).toString()
            : ethers.formatUnits(bridgeData?.amountOut || 0, tokenOut.decimals),
        fromToken: tokenIn,
        toToken: tokenOut,
        type: params.type,
        priceImpact: 0,
        route: ['relay'],
        tx: {
          to: bridgeData?.to || '',
          data: bridgeData?.data || '',
          value: bridgeData?.value || '0',
          gasLimit: bridgeData.gasLimit,
          network: params.fromNetwork,
          lastValidBlockHeight: bridgeData?.lastValidBlockHeight,
        },
      };
      this.storeQuote(quote);
      return quote;
    } catch (e) {
      logger.error('Error getting quote:', e);
      throw new Error(`Failed to get quote: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  getAddressLookupTableAccounts = async (
    connection: anchor.web3.Connection,
    keys: string[],
  ): Promise<anchor.web3.AddressLookupTableAccount[]> => {
    const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
      keys.map(key => new anchor.web3.PublicKey(key)),
      'confirmed',
    );

    return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
      const addressLookupTableAddress = keys[index];
      if (accountInfo) {
        const addressLookupTableAccount = new anchor.web3.AddressLookupTableAccount({
          key: new anchor.web3.PublicKey(addressLookupTableAddress),
          state: anchor.web3.AddressLookupTableAccount.deserialize(accountInfo.data),
        });
        acc.push(addressLookupTableAccount);
      }

      return acc;
    }, new Array<anchor.web3.AddressLookupTableAccount>());
  };

  private async convertSolanaTransactionData(
    payer: string,
    connection: Connection,
    txInstructions: anchor.web3.TransactionInstruction[],
    addressLookupTableAccounts: string[],
  ): Promise<{ data: string; lastValidBlockHeight?: number }> {
    try {
      const _addressLookupTableAccounts = await this.getAddressLookupTableAccounts(
        connection,
        addressLookupTableAccounts.map(account => account.toString()),
      );

      const latestBlockhash = await connection.getLatestBlockhash('confirmed');

      const messageV0 = new anchor.web3.TransactionMessage({
        payerKey: new PublicKey(payer),
        recentBlockhash: latestBlockhash.blockhash,
        instructions: txInstructions,
      }).compileToV0Message(_addressLookupTableAccounts);
      const transaction = new anchor.web3.VersionedTransaction(messageV0);

      const serialized_tx = Buffer.from(transaction.serialize()).toString('base64');

      return {
        data: serialized_tx,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      };
    } catch (error) {
      logger.error('Failed to convert Solana transaction data:', error);
      throw new Error(`Failed to convert Solana transaction data: ${error}`);
    }
  }

  private convertToTransactionInstructions(
    rawInstructions: Array<{
      keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
      programId: string;
      data: string;
    }>,
  ): anchor.web3.TransactionInstruction[] {
    return rawInstructions.map(instruction => {
      const keys = instruction.keys.map(key => ({
        pubkey: new anchor.web3.PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      }));

      return new anchor.web3.TransactionInstruction({
        keys,
        programId: new anchor.web3.PublicKey(instruction.programId),
        data: Buffer.from(instruction.data, 'hex'),
      });
    });
  }

  private async buildBridgeData(
    params: BridgeParams,
    fromWalletAddress: string,
    toWalletAddress: string,
    tokenIn: Token,
    tokenOut: Token,
    adjustedAmount: string,
  ): Promise<Transaction> {
    try {
      logger.info('🚀 Building bridge data for params:', {
        fromNetwork: params.fromNetwork,
        toNetwork: params.toNetwork,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: adjustedAmount,
      });

      const srcChainId = MAPPING_CHAIN_ID[params.fromNetwork as SupportedChain];
      const dstChainId = MAPPING_CHAIN_ID[params.toNetwork as SupportedChain];
      const srcChainTokenInAmount = parseTokenAmount(adjustedAmount, tokenIn.decimals);

      const requestBody: RelayQuoteRequest = {
        user: fromWalletAddress,
        originChainId: srcChainId,
        destinationChainId: dstChainId,
        originCurrency: this.getTokenAddress(params.fromToken, params.fromNetwork),
        destinationCurrency: this.getTokenAddress(params.toToken, params.toNetwork),
        recipient: toWalletAddress,
        tradeType: 'EXACT_INPUT',
        amount: srcChainTokenInAmount.toString(),
        referrer: RELAY_API_CONFIG.DEFAULT_REFERRER,
        useExternalLiquidity: false,
        useDepositAddress: false,
        topupGas: false,
      };

      const response = await this.makeRelayQuoteRequest(requestBody);

      const data = response.data as RelayQuoteResponse;

      let dataTx = data.steps[0]?.items[0]?.data;
      let dataRaw;

      let lastValidBlockHeight;

      if (params.fromNetwork === 'solana') {
        const connection = this.getSolanaProviderForNetwork(NetworkName.SOLANA);
        const instructions = this.convertToTransactionInstructions(
          dataTx.instructions as unknown as Array<{
            keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
            programId: string;
            data: string;
          }>,
        );
        const convertedData = await this.convertSolanaTransactionData(
          fromWalletAddress,
          connection,
          instructions,
          dataTx.addressLookupTableAddresses as unknown as string[],
        );
        dataRaw = convertedData.data;
        lastValidBlockHeight = convertedData.lastValidBlockHeight;
      } else {
        dataRaw = dataTx.data;
      }

      return {
        to: dataTx.to,
        data: dataRaw,
        value: params.fromNetwork === 'solana' ? srcChainTokenInAmount.toString() : dataTx.value,
        gasLimit: RELAY_API_CONFIG.DEFAULT_GAS_LIMIT,
        network: params.fromNetwork,
        amountOut: data?.details?.currencyOut?.amount || '0',
        lastValidBlockHeight,
      };
    } catch (error) {
      logger.error('Failed to build bridge data:', error);
      throw new Error(`Failed to build bridge data: ${error}`);
    }
  }

  private getTokenAddress(tokenAddress: string, network: NetworkName): string {
    return this.isNativeToken(tokenAddress) || this.isNativeSolana(tokenAddress)
      ? MAPPING_TOKEN[network as SupportedToken]
      : tokenAddress;
  }

  private async makeRelayQuoteRequest(requestBody: RelayQuoteRequest) {
    try {
      return await axios.post(
        `${RELAY_API_CONFIG.BASE_URL}${RELAY_API_CONFIG.ENDPOINTS.QUOTE}`,
        requestBody,
        { headers: RELAY_API_CONFIG.HEADERS },
      );
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new Error(
          `Relay API request failed: ${error.response?.data?.message || error.message}`,
        );
      }
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    return Promise.resolve();
  }
}
