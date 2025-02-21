import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IWalletProvider } from './types';

export interface WalletToolConfig extends IToolConfig {
  defaultChain?: string;
  supportedChains?: string[];
}

export class GetWalletBalanceTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultChain: string;
  private supportedChains: Set<string>;

  constructor(config: WalletToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultChain = config.defaultChain || 'bnb';
    this.supportedChains = new Set<string>(config.supportedChains || []);
  }

  registerProvider(provider: IWalletProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  getName(): string {
    return 'get_wallet_balance';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const chains = Array.from(this.supportedChains).join(', ');
    return `Get wallet balance from address. Supports chains: ${chains}. Available providers: ${providers}`;
  }

  private getSupportedChains(): string[] {
    const agentNetworks = Object.keys(this.agent.getNetworks());
    const providerChains = Array.from(this.supportedChains);
    return agentNetworks.filter(network => providerChains.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const supportedChains = this.getSupportedChains();
    if (supportedChains.length === 0) {
      throw new Error('No supported chains available');
    }

    return z.object({
      address: z
        .string()
        .optional()
        .describe('The wallet address to query (optional - uses agent wallet if not provided)'),
      chain: z
        .enum(supportedChains as [string, ...string[]])
        .default(this.defaultChain)
        .describe('The blockchain to query the wallet on'),
    });
  }

  createTool(): DynamicStructuredTool<z.ZodObject<any>> {
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args: any) => {
        try {
          const chain = args.chain || this.defaultChain;
          let address = args.address;

          // If no address provided, get it from the agent's wallet
          if (!address) {
            address = await this.agent.getWallet().getAddress(chain);
          }

          const providers = this.registry.getProvidersByChain(chain);
          if (providers.length === 0) {
            throw new Error(`No providers available for chain ${chain}`);
          }

          // Try each provider until we get a result
          let lastError: Error | undefined;
          for (const provider of providers) {
            try {
              const walletInfo = await provider.getWalletInfo(address, chain);
              return JSON.stringify({
                status: 'success',
                data: walletInfo,
                provider: provider.getName(),
                chain,
              });
            } catch (error) {
              console.warn(`Failed to get wallet info from ${provider.getName()}:`, error);
              lastError = error as Error;
              continue;
            }
          }

          throw new Error(
            `Failed to get wallet information for ${address} on chain ${chain}. Last error: ${lastError?.message}`,
          );
        } catch (error) {
          console.error('Wallet info error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            chain: args.chain || this.defaultChain,
          });
        }
      },
    });
  }
}
