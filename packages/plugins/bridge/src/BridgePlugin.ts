import { BridgeTool } from './BridgeTool';
import { IBridgeProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';
import { BaseTool, IPluginConfig, BasePlugin, NetworkName } from '@binkai/core';

export interface BridgePluginConfig extends IPluginConfig {
  defaultNetwork?: string;
  providers?: IBridgeProvider[];
  supportedNetworks?: string[];
}

export class BridgePlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private bridgeTool!: BridgeTool;
  private supportedNetworks: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set();
  }

  getName(): string {
    return 'bridge';
  }

  async initialize(config: BridgePluginConfig): Promise<void> {
    // Initialize supported chains
    if (config.supportedNetworks) {
      config.supportedNetworks.forEach(network => this.supportedNetworks.add(network));
    }

    // Configure bridge tool
    this.bridgeTool = new BridgeTool({
      defaultNetwork: config.defaultNetwork,
      supportedNetworks: Array.from(this.supportedNetworks),
    });

    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools(): BaseTool[] {
    return [this.bridgeTool as unknown as BaseTool];
  }

  /**
   * Register a new bridge provider
   */
  registerProvider(provider: IBridgeProvider): void {
    this.registry.registerProvider(provider);
    this.bridgeTool.registerProvider(provider);

    // Add provider's supported chains
    provider.getSupportedNetworks().forEach((network: NetworkName) => {
      this.supportedNetworks.add(network);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): IBridgeProvider[] {
    return this.registry.getProvidersByNetwork('*');
  }

  /**
   * Get providers for a specific network
   */
  getProvidersForNetwork(network: NetworkName): IBridgeProvider[] {
    return this.registry.getProvidersByNetwork(network);
  }

  /**
   * Get all supported chains
   */
  getSupportedNetworks(): NetworkName[] {
    return Array.from(this.supportedNetworks) as NetworkName[];
  }

  async cleanup(): Promise<void> {
    // Cleanup any provider resources if needed
    const providers = this.getProviders();
    await Promise.all(
      providers.map(async provider => {
        if ('cleanup' in provider && typeof provider.cleanup === 'function') {
          await provider.cleanup();
        }
      }),
    );
  }
}
