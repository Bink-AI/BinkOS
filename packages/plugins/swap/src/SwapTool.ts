import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ISwapProvider, SwapQuote, SwapParams } from './types';
import { validateTokenAddress } from './utils/addressValidation';

export interface SwapToolConfig extends IToolConfig {
  defaultSlippage?: number;
  defaultChain?: string;
  supportedChains?: string[];
}

export class SwapTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultSlippage: number;
  private defaultChain: string;
  private supportedChains: Set<string>;

  constructor(config: SwapToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultSlippage = config.defaultSlippage || 0.5;
    this.defaultChain = config.defaultChain || 'bnb';
    this.supportedChains = new Set<string>(config.supportedChains || []);
  }

  registerProvider(provider: ISwapProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  getName(): string {
    return 'swap';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const chains = Array.from(this.supportedChains).join(', ');
    let description = `Swap tokens using various DEX providers (${providers}). Supports chains: ${chains}. You can specify either input amount (how much to spend) or output amount (how much to receive).`;

    // Add provider-specific prompts if they exist
    const providerPrompts = this.registry
      .getProviders()
      .map((provider: ISwapProvider) => {
        const prompt = provider.getPrompt?.();
        return prompt ? `${provider.getName()}: ${prompt}` : null;
      })
      .filter((prompt: unknown): prompt is string => !!prompt);

    if (providerPrompts.length > 0) {
      description += '\n\nProvider-specific information:\n' + providerPrompts.join('\n');
    }

    return description;
  }

  private getSupportedChains(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported chains from providers
    const providerChains = Array.from(this.supportedChains);

    // Return intersection of agent networks and provider supported chains
    return agentNetworks.filter(network => providerChains.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No swap providers registered');
    }

    const supportedChains = this.getSupportedChains();
    if (supportedChains.length === 0) {
      throw new Error('No supported chains available');
    }

    return z.object({
      fromToken: z.string().describe('The token address swap from'),
      toToken: z.string().describe('The token address swap to'),
      amount: z.string().describe('The amount of tokens to swap'),
      amountType: z
        .enum(['input', 'output'])
        .describe('Whether the amount is input (spend) or output (receive)'),
      chain: z
        .enum(supportedChains as [string, ...string[]])
        .default(this.defaultChain)
        .describe('The blockchain to execute the swap on'),
      // provider: z
      //   .enum(providers as [string, ...string[]])
      //   .optional()
      //   .describe(
      //     'The DEX provider to use for the swap. If not specified, the best rate will be found',
      //   ),
      slippage: z
        .number()
        .optional()
        .describe(`Maximum slippage percentage allowed (default: ${this.defaultSlippage})`),
    });
  }

  private async findBestQuote(
    params: SwapParams & { chain: string },
  ): Promise<{ provider: ISwapProvider; quote: SwapQuote }> {
    // Validate chain is supported
    const providers = this.registry.getProvidersByChain(params.chain);
    if (providers.length === 0) {
      throw new Error(`No providers available for chain ${params.chain}`);
    }

    const userAddress = await this.agent.getWallet().getAddress(params.chain);

    const quotes = await Promise.all(
      providers.map(async provider => {
        try {
          console.log('🤖 Getting quote from', provider.getName());
          const quote = await provider.getQuote(params, userAddress);
          return { provider, quote };
        } catch (error) {
          console.warn(`Failed to get quote from ${provider.getName()}:`, error);
          return null;
        }
      }),
    );

    const validQuotes = quotes.filter((q): q is NonNullable<typeof q> => q !== null);
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes found');
    }

    // Find the best quote based on amount type
    return validQuotes.reduce((best, current) => {
      if (params.type === 'input') {
        // For input amount, find highest output amount
        const bestAmount = BigInt(Number(best.quote.toAmount) * 10 ** best.quote.toTokenDecimals);
        const currentAmount = BigInt(
          Number(current.quote.toAmount) * 10 ** current.quote.toTokenDecimals,
        );
        return currentAmount > bestAmount ? current : best;
      } else {
        // For output amount, find lowest input amount
        const bestAmount = BigInt(
          Number(best.quote.fromAmount) * 10 ** best.quote.fromTokenDecimals,
        );
        const currentAmount = BigInt(
          Number(current.quote.fromAmount) * 10 ** current.quote.fromTokenDecimals,
        );
        return currentAmount < bestAmount ? current : best;
      }
    }, validQuotes[0]);
  }

  createTool(): DynamicStructuredTool {
    console.log('✓ Creating tool', this.getName());
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args: any) => {
        try {
          const {
            fromToken,
            toToken,
            amount,
            amountType,
            chain = this.defaultChain,
            // provider: preferredProvider, // DISABLED FOR NOW
            slippage = this.defaultSlippage,
          } = args;

          console.log('🤖 Swap Args:', args);

          // Validate token addresses
          if (!validateTokenAddress(fromToken, chain)) {
            throw new Error(`Invalid fromToken address for chain ${chain}: ${fromToken}`);
          }
          if (!validateTokenAddress(toToken, chain)) {
            throw new Error(`Invalid toToken address for chain ${chain}: ${toToken}`);
          }

          // Get agent's wallet and address
          const wallet = this.agent.getWallet();
          const userAddress = await wallet.getAddress(chain);

          // Validate chain is supported
          const supportedChains = this.getSupportedChains();
          if (!supportedChains.includes(chain)) {
            throw new Error(
              `Chain ${chain} is not supported. Supported chains: ${supportedChains.join(', ')}`,
            );
          }

          const swapParams: SwapParams = {
            fromToken,
            toToken,
            amount,
            type: amountType,
            slippage,
          };

          let selectedProvider: ISwapProvider;
          let quote: SwapQuote;

          let preferredProvider = null; // TODO: Implement preferred provider

          if (preferredProvider) {
            selectedProvider = this.registry.getProvider(preferredProvider);
            // Validate provider supports the chain
            if (!selectedProvider.getSupportedChains().includes(chain)) {
              throw new Error(`Provider ${preferredProvider} does not support chain ${chain}`);
            }
            quote = await selectedProvider.getQuote(swapParams, userAddress);
          } else {
            const bestQuote = await this.findBestQuote({
              ...swapParams,
              chain,
            });
            selectedProvider = bestQuote.provider;
            quote = bestQuote.quote;
          }

          console.log('🤖 The selected provider is:', selectedProvider.getName());

          // Build swap transaction
          const swapTx = await selectedProvider.buildSwapTransaction(quote, userAddress);

          // Check if approval is needed and handle it
          const allowance = await selectedProvider.checkAllowance(
            quote.fromToken,
            userAddress,
            swapTx.to,
          );
          const requiredAmount = BigInt(Number(quote.fromAmount) * 10 ** quote.fromTokenDecimals);

          console.log('🤖 Allowance: ', allowance, ' Required amount: ', requiredAmount);

          if (allowance < requiredAmount) {
            const approveTx = await selectedProvider.buildApproveTransaction(
              quote.fromToken,
              swapTx.to,
              quote.fromAmount,
              userAddress,
            );
            console.log('🤖 Approving...');
            // Sign and send approval transaction
            const approveReceipt = await wallet.signAndSendTransaction(chain, {
              to: approveTx.to,
              data: approveTx.data,
              value: BigInt(approveTx.value),
              gasLimit: BigInt(approveTx.gasLimit),
            });

            console.log('🤖 ApproveReceipt:', approveReceipt);

            // Wait for approval to be mined
            await approveReceipt.wait();
          }
          console.log('🤖 Swapping...');

          // Sign and send swap transaction
          const receipt = await wallet.signAndSendTransaction(chain, {
            to: swapTx.to,
            data: swapTx.data,
            value: BigInt(swapTx.value),
            gasLimit: BigInt(swapTx.gasLimit),
          });
          // Wait for transaction to be mined
          const finalReceipt = await receipt.wait();

          // Return result as JSON string
          return JSON.stringify({
            provider: selectedProvider.getName(),
            fromToken: quote.fromToken,
            toToken: quote.toToken,
            fromAmount: quote.fromAmount.toString(),
            toAmount: quote.toAmount.toString(),
            transactionHash: finalReceipt.hash,
            priceImpact: quote.priceImpact,
            type: quote.type,
            chain,
          });
        } catch (error) {
          console.error('Swap error:', error);
          return JSON.stringify({
            status: 'error',
            message: error,
          });
        }
      },
    });
  }
}
