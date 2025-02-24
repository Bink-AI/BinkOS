import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IStakingProvider, StakingQuote, StakingParams } from './types';
import { validateTokenAddress } from './utils/addressValidation';

export interface StakingToolConfig extends IToolConfig {
  defaultChain?: string;
  supportedChains?: string[];
}

export class StakingTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultChain: string;
  private supportedChains: Set<string>;

  constructor(config: StakingToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultChain = config.defaultChain || 'bnb';
    this.supportedChains = new Set<string>(config.supportedChains || []);
  }

  registerProvider(provider: IStakingProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  getName(): string {
    return 'staking';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const chains = Array.from(this.supportedChains).join(', ');
    let description = `Staking tokens using various staking providers (${providers}). Supports chains: ${chains}. You can specify either input amount (how much to spend)`;

    // Add provider-specific prompts if they exist
    const providerPrompts = this.registry
      .getProviders()
      .map((provider: IStakingProvider) => {
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
      throw new Error('No staking providers registered');
    }

    const supportedChains = this.getSupportedChains();
    if (supportedChains.length === 0) {
      throw new Error('No supported chains available');
    }

    return z.object({
      fromToken: z.string().describe('The token address staking from'),
      toToken: z.string().describe('The token address staking to'),
      amount: z.string().describe('The amount of tokens to staking'),
      type: z
        .enum(['supply', 'withdraw', 'stake', 'unstake'])
        .describe('The type of staking operation to perform'),
      chain: z
        .enum(supportedChains as [string, ...string[]])
        .default(this.defaultChain)
        .describe('The blockchain to execute the staking on'),
      // provider: z
      //   .enum(providers as [string, ...string[]])
      //   .optional()
      //   .describe(
      //     'The DEX provider to use for the staking. If not specified, the best rate will be found',
      //   ),
    });
  }

  private async findBestQuote(
    params: StakingParams & { chain: string },
  ): Promise<{ provider: IStakingProvider; quote: StakingQuote }> {
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
      // For input amount, find highest output amount
      const bestAmount = BigInt(Number(best.quote.toAmount) * 10 ** best.quote.toTokenDecimals);
      const currentAmount = BigInt(
        Number(current.quote.toAmount) * 10 ** current.quote.toTokenDecimals,
      );
      return currentAmount > bestAmount ? current : best;
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
            type,
            chain = this.defaultChain,
            // provider: preferredProvider, // DISABLED FOR NOW
          } = args;

          console.log('🤖 Staking Args:', args);

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

          const stakingParams: StakingParams = {
            fromToken,
            toToken,
            amount,
            type,
          };

          let selectedProvider: IStakingProvider;
          let quote: StakingQuote;

          let preferredProvider = null; // TODO: Implement preferred provider

          if (preferredProvider) {
            selectedProvider = this.registry.getProvider(preferredProvider);
            // Validate provider supports the chain
            if (!selectedProvider.getSupportedChains().includes(chain)) {
              throw new Error(`Provider ${preferredProvider} does not support chain ${chain}`);
            }
            quote = await selectedProvider.getQuote(stakingParams, userAddress);
          } else {
            const bestQuote = await this.findBestQuote({
              ...stakingParams,
              chain,
            });
            selectedProvider = bestQuote.provider;
            quote = bestQuote.quote;
          }

          console.log('🤖 The selected provider is:', selectedProvider.getName());

          // Build Staking transaction
          const stakingTx = await selectedProvider.buildStakingTransaction(quote, userAddress);

          // Check if approval is needed and handle it
          const allowance = await selectedProvider.checkAllowance(
            quote.fromToken,
            userAddress,
            stakingTx.to,
          );
          const requiredAmount = BigInt(Number(quote.fromAmount) * 10 ** quote.fromTokenDecimals);

          console.log('🤖 Allowance: ', allowance, ' Required amount: ', requiredAmount);

          if (allowance < requiredAmount) {
            const approveTx = await selectedProvider.buildApproveTransaction(
              quote.fromToken,
              stakingTx.to,
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
          console.log('🤖 Staking...');

          // Sign and send Staking transaction
          const receipt = await wallet.signAndSendTransaction(chain, {
            to: stakingTx.to,
            data: stakingTx.data,
            value: BigInt(stakingTx.value),
            gasLimit: BigInt(stakingTx.gasLimit),
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
            type: quote.type,
            chain,
          });
        } catch (error) {
          console.error('Staking error:', error);
          return JSON.stringify({
            status: 'error',
            message: error,
          });
        }
      },
    });
  }
}
