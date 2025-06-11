import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  AgentNodeTypes,
  BaseTool,
  CustomDynamicStructuredTool,
  IToolConfig,
  ToolProgress,
  logger,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IBridgeProvider, BridgeQuote, BridgeParams, BasicToken } from './types';
import { validateTokenAddress } from './utils/addressValidation';

export interface BridgeToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
  supportedTokens?: BasicToken[];
}

export class BridgeTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: BridgeToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultNetwork = config.defaultNetwork || 'solana';
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: IBridgeProvider): void {
    this.registry.registerProvider(provider);
    logger.info('✓ Provider registered', provider.constructor.name);
    // Add provider's supported chains
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'bridge';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');

    let description = `Bridge or swap crosschain tokens using various DEX providers (${providers}).Supports networks: ${networks}.
     You can specify either input amount (how much to spend) or to output amount (how much to receive).
     Token address need found in the token list between two networks.
     Don't retry if there is insufficient balance.
     If user input buy token with symbol and empty network, need check exactly the token symbol input user with token symbol found`;

    // Add provider-specific prompts if they exist
    const providerPrompts = this.registry
      .getProviders()
      .map((provider: IBridgeProvider) => {
        const prompt = provider.getPrompt?.();
        return prompt ? `${provider.getName()}: ${prompt}` : null;
      })
      .filter((prompt: unknown): prompt is string => !!prompt);

    if (providerPrompts.length > 0) {
      description += '\n\nProvider-specific information:\n' + providerPrompts.join('\n');
    }

    return description;
  }

  private getSupportedNetworks(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported chains from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported chains
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No bridge providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      fromNetwork: z
        .enum(supportedNetworks as [string, ...string[]])
        // .default(this.defaultNetwork)
        .describe('The blockchain network to execute the bridge from'),
      toNetwork: z
        .enum(supportedNetworks as [string, ...string[]])
        // .default(this.defaultNetwork)
        .describe(
          'The blockchain network to execute the bridge to or on symbor native token. Example: Solana similar SOL or on BNB',
        ),
      fromToken: z.string().describe('The address of send token'),
      toToken: z.string().describe(`The address of receive token`),
      amount: z.string().describe('The amount of tokens to bridge'),
      amountType: z
        .enum(['input', 'output'])
        .describe('Whether the amount is input (spend) or output (receive)'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The protocol provider to use for the bridge. If not specified, the best rate will be found',
        ),
    });
  }

  private async findBestQuote(
    params: BridgeParams & { network: string },
    fromWalletAddress: string,
    toWalletAddress: string,
  ): Promise<{ provider: IBridgeProvider; quote: BridgeQuote }> {
    // Validate chain is supported
    const providers = this.registry.getProvidersByNetwork(params.fromNetwork);
    if (providers.length === 0) {
      throw new Error(`No providers available for network ${params.network}`);
    }

    const quotes = await Promise.all(
      providers.map(async provider => {
        try {
          logger.info('🤖 Getting quote from', provider.getName());
          const quote = await provider.getQuote(params, fromWalletAddress, toWalletAddress);
          return { provider, quote };
        } catch (error) {
          logger.warn(`Failed to get quote from ${provider.getName()}:`, error);
          return null;
        }
      }),
    );

    type QuoteResult = { provider: IBridgeProvider; quote: BridgeQuote };
    const validQuotes = quotes.filter((q): q is QuoteResult => q !== null);
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes found');
    }

    // Find the best quote based on amount type
    return validQuotes.reduce((best: QuoteResult, current: QuoteResult) => {
      if (params.type === 'input') {
        // For input amount, find highest output amount
        const bestAmount = BigInt(Number(best.quote.toAmount) * 10 ** best.quote.toToken.decimals);
        const currentAmount = BigInt(
          Number(current.quote.toAmount) * 10 ** current.quote.toToken.decimals,
        );
        return currentAmount > bestAmount ? current : best;
      } else {
        // For output amount, find lowest input amount
        const bestAmount = BigInt(
          Number(best.quote.fromAmount) * 10 ** best.quote.fromToken.decimals,
        );
        const currentAmount = BigInt(
          Number(current.quote.fromAmount) * 10 ** current.quote.fromToken.decimals,
        );
        return currentAmount < bestAmount ? current : best;
      }
    }, validQuotes[0]);
  }

  async getQuote(
    args: any,
    onProgress?: (data: ToolProgress) => void,
  ): Promise<{
    selectedProvider: IBridgeProvider;
    quote: BridgeQuote;
    fromWalletAddress: string;
    toWalletAddress: string;
  }> {
    const {
      fromNetwork,
      toNetwork,
      fromToken,
      toToken,
      amount,
      amountType,
      provider: preferredProvider,
    } = args;
    // Validate token addresses
    if (!validateTokenAddress(fromToken, fromNetwork)) {
      throw new Error(`Invalid fromToken address for network ${fromNetwork}: ${fromToken}`);
    }
    if (!validateTokenAddress(toToken, toNetwork)) {
      throw new Error(`Invalid toToken address for network ${toNetwork}: ${toToken}`);
    }

    if (fromNetwork === toNetwork) {
      throw new Error('From and to networks cannot be the same');
    }

    if (fromToken === toToken) {
      throw new Error('From and to tokens cannot be the same');
    }

    // Get agent's wallet and address
    const wallet = this.agent.getWallet();
    const fromWalletAddress = await wallet.getAddress(fromNetwork);
    const toWalletAddress = await wallet.getAddress(toNetwork);

    logger.info('🚀 ~ BridgeTool ~ createTool ~ fromWalletAddress:', fromWalletAddress);
    logger.info('🚀 ~ BridgeTool ~ createTool ~ toWalletAddress:', toWalletAddress);

    // Validate chain is supported
    const supportedNetworks = this.getSupportedNetworks();
    if (!supportedNetworks.includes(fromNetwork)) {
      throw new Error(
        `Network ${fromNetwork} is not supported. Supported networks: ${supportedNetworks.join(', ')}`,
      );
    }

    const bridgeParams: BridgeParams = {
      fromNetwork,
      toNetwork,
      fromToken: fromToken,
      toToken: toToken,
      amount: amount,
      type: amountType,
    };
    logger.info('🚀 ~ BridgeTool ~ func: ~ bridgeParams:', bridgeParams);

    let selectedProvider: IBridgeProvider;
    let quote: BridgeQuote;

    onProgress?.({
      progress: 0,
      message: `Searching for the best bridge rate from ${fromNetwork} to ${toNetwork}.`,
    });

    if (preferredProvider) {
      try {
        selectedProvider = this.registry.getProvider(preferredProvider);
        // Validate provider supports the chain
        if (!selectedProvider.getSupportedNetworks().includes(fromNetwork)) {
          throw new Error(`Provider ${preferredProvider} does not support network ${fromNetwork}`);
        }
        quote = await selectedProvider.getQuote(bridgeParams, fromWalletAddress, toWalletAddress);
      } catch (error) {
        logger.warn(`Failed to get quote from preferred provider ${preferredProvider}:`, error);
        const bestQuote = await this.findBestQuote(
          {
            ...bridgeParams,
            network: fromNetwork,
          },
          fromWalletAddress,
          toWalletAddress,
        );
        selectedProvider = bestQuote.provider;
        quote = bestQuote.quote;
      }
    } else {
      const bestQuote = await this.findBestQuote(
        {
          ...bridgeParams,
          network: fromNetwork,
        },
        fromWalletAddress,
        toWalletAddress,
      );
      selectedProvider = bestQuote.provider;
      quote = bestQuote.quote;
    }

    onProgress?.({
      progress: 10,
      message: `Verifying you have sufficient ${quote.fromToken.symbol || 'tokens'} for this bridge.`,
    });

    // Check user's balance before proceeding
    const balanceCheck = await selectedProvider.checkBalance(quote, fromWalletAddress);
    if (!balanceCheck.isValid) {
      throw new Error(balanceCheck.message || 'Insufficient balance for bridge');
    }

    return {
      selectedProvider,
      quote: {
        ...quote,
        provider: selectedProvider.getName(),
      },
      fromWalletAddress,
      toWalletAddress,
    };
  }

  async simulateQuoteTool(args: any): Promise<BridgeQuote> {
    if (this.agent.isMockResponseTool()) {
      const mockResponse = await this.mockResponseTool(args);
      return JSON.parse(mockResponse);
    }
    return (await this.getQuote(args)).quote;
  }

  mockResponseTool(args: any): Promise<string> {
    return Promise.resolve(
      JSON.stringify({
        provider: args.provider,
        fromToken: args.fromToken,
        toToken: args.toToken,
        fromAmount: args.amount,
        toAmount: args.amount,
        transactionHash: args.transactionHash,
        priceImpact: args.priceImpact,
        type: args.type,
        fromNetwork: args.fromNetwork,
        toNetwork: args.toNetwork,
      }),
    );
  }
  createTool(): CustomDynamicStructuredTool {
    logger.info('✓ Creating tool', this.getName());
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (
        args: any,
        runManager?: any,
        config?: any,
        onProgress?: (data: ToolProgress) => void,
      ) => {
        try {
          const {
            fromNetwork,
            toNetwork,
            fromToken,
            toToken,
            amount,
            amountType,
            provider: preferredProvider,
          } = args;

          logger.info('🤖 Bridge Args:', args);
          if (this.agent.isMockResponseTool()) {
            return this.mockResponseTool(args);
          }

          const { selectedProvider, quote, fromWalletAddress, toWalletAddress } =
            await this.getQuote(args, onProgress);
          const wallet = this.agent.getWallet();

          onProgress?.({
            progress: 30,
            message: `Preparing to bridge ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for approximately ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} via ${selectedProvider.getName()}.`,
          });

          // Build bridge transaction call to provider
          const bridgeTx = await selectedProvider.buildBridgeTransaction(
            quote,
            fromWalletAddress,
            toWalletAddress,
          );

          //const receipt = await wallet.signAndSendTransaction(fromNetwork, bridgeTx as any);
          onProgress?.({
            progress: 50,
            message: `Found best rate with ${selectedProvider.getName()}. Preparing bridge transaction.`,
          });

          onProgress?.({
            progress: 70,
            message: `Sending bridge transaction to move ${quote.fromAmount} ${quote.fromToken.symbol} from ${fromNetwork} to ${toNetwork}.`,
          });

          const receipt = await wallet.signAndSendTransaction(fromNetwork, bridgeTx as any);

          // Wait for transaction to be mined
          const finalReceipt = await receipt?.wait();

          onProgress?.({
            progress: 100,
            message: `Bridge complete! Successfully bridged ${quote.fromAmount} ${quote.fromToken} from ${fromNetwork} to ${toNetwork}. Transaction hash: ${finalReceipt?.hash}`,
          });

          //Return result as JSON string
          return JSON.stringify({
            provider: selectedProvider.getName(),
            fromToken: quote.fromToken,
            toToken: quote.toToken,
            fromAmount: quote.fromAmount.toString(),
            toAmount: quote.toAmount.toString(),
            transactionHash: finalReceipt?.hash,
            priceImpact: quote.priceImpact,
            type: quote.type,
            fromNetwork,
            toNetwork,
          });
        } catch (error) {
          logger.error('🚀 ~ BridgeTool ~ func: ~ error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    };
  }
}
