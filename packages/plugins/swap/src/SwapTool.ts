import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, CustomDynamicStructuredTool, IToolConfig, ToolProgress } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ISwapProvider, SwapQuote, SwapParams } from './types';
import { validateTokenAddress } from './utils/addressValidation';
import { parseTokenAmount } from './utils/tokenUtils';
import { isSolanaNetwork } from './utils/networkUtils';

export interface SwapToolConfig extends IToolConfig {
  defaultSlippage?: number;
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export class SwapTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultSlippage: number;
  private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: SwapToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultSlippage = config.defaultSlippage || 0.5;
    this.defaultNetwork = config.defaultNetwork || 'bnb';
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: ISwapProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'swap';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    let description = `The SwapTool enables users to exchange one cryptocurrency token for another using various Decentralized Exchange (DEX) 
    providers across supported blockchain networks. This tool facilitates token swaps, 
    allowing users to specify either the input amount (the amount they wish to spend) 
    or the output amount (the amount they wish to receive). Supported networks include ${networks}. 
    Providers include ${providers}.`;

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

  private getSupportedNetworks(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported networks from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported networks
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No swap providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      fromToken: z.string().describe(
        `The token contract address you wish to swap from. This should be a string. 
        For instance, the DAI token contract address on Ethereum is '0x6B175474E89094C44Da98b954EedeAC495271d0F'. 
        Note: Avoid mistaken for token names or symbols, as they can be ambiguous.`,
      ),
      toToken: z.string().describe(
        `The token contract address you wish to swap to. This should be a string. 
          For instance, the DAI token contract address on Ethereum is '0x6B175474E89094C44Da98b954EedeAC495271d0F'. 
          Note: Avoid mistaken for token names or symbols, as they can be ambiguous.`,
      ),
      amount: z.string().describe('The amount of tokens to swap'),
      amountType: z
        .enum(['input', 'output'])
        .describe('Whether the amount is input (spend) or output (receive)'),
      network: z.enum(supportedNetworks as [string, ...string[]]).default(this.defaultNetwork)
        .describe(`Blockchain Network for Token Swap Execution: 
          Specify the blockchain network on which to execute the token swap. 
          If not specified, the default network is ${this.defaultNetwork}. 
          Ensure that the token contract addresses correspond to the selected network. `),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The DEX provider to use for the swap. If not specified, the best rate will be found',
        ),
      slippage: z
        .number()
        .optional()
        .describe(`Maximum slippage percentage allowed (default: ${this.defaultSlippage})`),
    });
  }

  private async findBestQuote(
    params: SwapParams & { network: string },
    userAddress: string,
  ): Promise<{ provider: ISwapProvider; quote: SwapQuote }> {
    // Validate network is supported
    const providers = this.registry.getProvidersByNetwork(params.network);
    if (providers.length === 0) {
      throw new Error(`No providers available for network ${params.network}`);
    }

    const quotes = await Promise.all(
      providers.map(async (provider: ISwapProvider) => {
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

    type QuoteResult = { provider: ISwapProvider; quote: SwapQuote };
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

  createTool(): CustomDynamicStructuredTool {
    console.log('✓ Creating tool', this.getName());
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
            fromToken,
            toToken,
            amount,
            amountType,
            network,
            provider: preferredProvider,
            slippage = this.defaultSlippage,
          } = args;

          console.log('🤖 Swap Args:', args);

          // Validate token addresses
          if (!validateTokenAddress(fromToken, network)) {
            throw new Error(`Invalid fromToken address for network ${network}: ${fromToken}`);
          }
          if (!validateTokenAddress(toToken, network)) {
            throw new Error(`Invalid toToken address for network ${network}: ${toToken}`);
          }

          // Get agent's wallet and address
          const wallet = this.agent.getWallet();
          const userAddress = await wallet.getAddress(network);

          // Validate network is supported
          const supportedNetworks = this.getSupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            throw new Error(
              `Network ${network} is not supported. Supported networks: ${supportedNetworks.join(', ')}`,
            );
          }

          const swapParams: SwapParams = {
            network,
            fromToken,
            toToken,
            amount,
            type: amountType,
            slippage,
          };

          let selectedProvider: ISwapProvider;
          let quote: SwapQuote;

          onProgress?.({
            progress: 0,
            message: 'Searching for the best exchange rate for your swap.',
          });

          if (preferredProvider) {
            try {
              selectedProvider = this.registry.getProvider(preferredProvider);
              // Validate provider supports the network
              if (!selectedProvider.getSupportedNetworks().includes(network)) {
                throw new Error(
                  `Provider ${preferredProvider} does not support network ${network}`,
                );
              }
              quote = await selectedProvider.getQuote(swapParams, userAddress);
            } catch (error) {
              console.warn(
                `Failed to get quote from preferred provider ${preferredProvider}:`,
                error,
              );
              console.log('🔄 Falling back to checking all providers for best quote...');
              const bestQuote = await this.findBestQuote(
                {
                  ...swapParams,
                  network,
                },
                userAddress,
              );
              selectedProvider = bestQuote.provider;
              quote = bestQuote.quote;
            }
          } else {
            const bestQuote = await this.findBestQuote(
              {
                ...swapParams,
                network,
              },
              userAddress,
            );
            selectedProvider = bestQuote.provider;
            quote = bestQuote.quote;
          }

          console.log('🤖 The selected provider is:', selectedProvider.getName());

          onProgress?.({
            progress: 10,
            message: `Verifying you have sufficient ${quote.fromToken.symbol || 'tokens'} for this swap.`,
          });
          // Check user's balance before proceeding
          const balanceCheck = await selectedProvider.checkBalance(quote, userAddress);
          if (!balanceCheck.isValid) {
            throw new Error(balanceCheck.message || 'Insufficient balance for swap');
          }

          onProgress?.({
            progress: 20,
            message: `Preparing to swap ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for approximately ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} via ${selectedProvider.getName()}.`,
          });
          // Build swap transaction
          const swapTx = await selectedProvider.buildSwapTransaction(quote, userAddress);

          onProgress?.({
            progress: 40,
            message: `Checking allowance... Verifying if approval is needed for ${selectedProvider.getName()} to access your ${quote.fromToken.symbol || 'tokens'}.`,
          });

          if (!isSolanaNetwork(network)) {
            // Check if approval is needed and handle it
            const allowance = await selectedProvider.checkAllowance(
              network,
              quote.fromToken.address,
              userAddress,
              swapTx.spender,
            );

            const requiredAmount = parseTokenAmount(quote.fromAmount, quote.fromToken.decimals);

            console.log('🤖 Allowance: ', allowance, ' Required amount: ', requiredAmount);

            if (allowance < requiredAmount) {
              const approveTx = await selectedProvider.buildApproveTransaction(
                network,
                quote.fromToken.address,
                swapTx.spender,
                quote.fromAmount,
                userAddress,
              );
              console.log('🤖 Approving...');
              // Sign and send approval transaction
              onProgress?.({
                progress: 60,
                message: `Approving ${selectedProvider.getName()} to access your ${quote.fromToken.symbol || 'tokens'}`,
              });
              const approveReceipt = await wallet.signAndSendTransaction(network, {
                to: approveTx.to,
                data: approveTx.data,
                value: BigInt(approveTx.value),
              });

              console.log('🤖 ApproveReceipt:', approveReceipt);

              // Wait for approval to be mined
              await approveReceipt.wait();
            }
          }

          console.log('🤖 Swapping...');

          onProgress?.({
            progress: 80,
            message: `Swapping ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for approximately ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} with ${slippage}% max slippage.`,
          });
          console.log('🤖 swapTx', swapTx);
          // Sign and send swap transaction
          const receipt = await wallet.signAndSendTransaction(network, {
            to: swapTx.to,
            data: swapTx.data,
            value: BigInt(swapTx.value),
          });

          // Wait for transaction to be mined
          const finalReceipt = await receipt?.wait();

          try {
            // Clear token balance caches after successful swap
            selectedProvider.invalidateBalanceCache(quote.fromToken.address, userAddress, network);
            selectedProvider.invalidateBalanceCache(quote.toToken.address, userAddress, network);
          } catch (error) {
            console.error('Error clearing token balance caches:', error);
          }

          onProgress?.({
            progress: 100,
            message: `Swap complete! Successfully swapped ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} via ${selectedProvider.getName()}. Transaction hash: ${finalReceipt.hash}`,
          });

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
            network,
          });
        } catch (error) {
          console.error('Swap error:', error);
          return JSON.stringify({
            status: 'error',
            message: error,
          });
        }
      },
    };
  }
}
