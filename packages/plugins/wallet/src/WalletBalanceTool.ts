import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, CustomDynamicStructuredTool, IToolConfig, ToolProgress } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IWalletProvider, WalletInfo } from './types';

export interface WalletToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export function mergeObjects<T extends Record<string, any>>(obj1: T, obj2: T): T {
  // Create a new object to avoid mutating the inputs
  const result = { ...obj1 };

  // Add or override properties from obj2
  for (const key in obj2) {
    if (Object.prototype.hasOwnProperty.call(obj2, key)) {
      // If both objects have the same key and both values are objects, merge recursively
      if (
        key in result &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        typeof obj2[key] === 'object' &&
        obj2[key] !== null &&
        !Array.isArray(result[key]) &&
        !Array.isArray(obj2[key])
      ) {
        result[key] = mergeObjects(result[key], obj2[key]);
      } else if (obj2[key] === null || obj2[key] === undefined) {
        // Keep obj1's value if obj2's value is null or undefined
        continue;
      } else if (result[key] === null || result[key] === undefined) {
        // Take obj2's value if obj1's value is null or undefined
        result[key] = obj2[key];
      } else {
        // Otherwise just take the value from obj2
        result[key] = obj2[key];
      }
    }
  }

  return result;
}

export class GetWalletBalanceTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: WalletToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultNetwork = config.defaultNetwork || 'bnb';
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: IWalletProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'get_wallet_balance';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Get detailed information about tokens and native currencies in a wallet. Shows balances of all tokens (ERC20, NFTs) and native currencies (ETH, BNB, etc.) that a wallet holds, including token balances, token addresses, symbols, and decimals. Supports networks: ${networks}. Available providers: ${providers}. Use this tool when you need to check what tokens or coins a wallet contains, their balances, and detailed token information.`;
  }

  private getsupportedNetworks(): string[] {
    const agentNetworks = Object.keys(this.agent.getNetworks());
    const providerNetworks = Array.from(this.supportedNetworks);
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const supportedNetworks = this.getsupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      address: z
        .string()
        .optional()
        .describe('The wallet address to query (optional - uses agent wallet if not provided)'),
      network: z
        .enum(supportedNetworks as [string, ...string[]])
        .default(this.defaultNetwork)
        .describe('The blockchain to query the wallet on'),
    });
  }

  createTool(): CustomDynamicStructuredTool {
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
          const network = args.network || this.defaultNetwork;
          let address = args.address;

          // If no address provided, get it from the agent's wallet
          if (!address) {
            address = await this.agent.getWallet().getAddress(network);
          }

          onProgress?.({
            progress: 20,
            message: `Retrieving wallet information for ${address} on ${network} network.`,
          });

          const providers = this.registry.getProvidersByNetwork(network);
          if (providers.length === 0) {
            throw new Error(`No providers available for network ${network}`);
          }

          let results: WalletInfo = {};
          const errors: Record<string, string> = {};

          // Try all providers and collect results
          for (const provider of providers) {
            try {
              const data = await provider.getWalletInfo(address, network);
              results = mergeObjects(results, data);
            } catch (error) {
              console.warn(`Failed to get wallet info from ${provider.getName()}:`, error);
              errors[provider.getName()] = error instanceof Error ? error.message : String(error);
            }
          }

          // If no successful results, throw error
          if (Object.keys(results).length === 0) {
            throw new Error(
              `Failed to get wallet information for ${address} on network ${network}. Errors: ${JSON.stringify(errors)}`,
            );
          }
          console.log('🤖 Wallet info:', results);

          onProgress?.({
            progress: 100,
            message: `Successfully retrieved wallet information for ${address} on ${network} network.`,
          });

          return JSON.stringify({
            status: Object.keys(results).length === 0 ? 'error' : 'success',
            data: results,
            errors,
            network,
          });
        } catch (error) {
          console.error('Wallet info error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            network: args.network || this.defaultNetwork,
          });
        }
      },
    };
  }
}
