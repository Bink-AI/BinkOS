import { BasePlugin, IPluginConfig, BaseTool, NetworkName } from '@binkai/core';
import { GetTokenInfoTool } from './TokenTool';
import { ITokenProvider, TokenInfo } from './types';
import { ProviderRegistry } from './ProviderRegistry';

export interface TokenPluginConfig extends IPluginConfig {
  providers?: ITokenProvider[];
  supportedNetworks?: NetworkName[];
}

export class TokenPlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private tokenTool!: GetTokenInfoTool;
  private supportedNetworks: Set<NetworkName>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set();
  }

  getName(): string {
    return 'token';
  }

  async initialize(config: TokenPluginConfig): Promise<void> {
    // Initialize supported networks
    if (config.supportedNetworks) {
      config.supportedNetworks.forEach(network => this.supportedNetworks.add(network));
    }

    // Configure token tool
    this.tokenTool = new GetTokenInfoTool({
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
    return [this.tokenTool as unknown as BaseTool];
  }

  /**
   * Register a new token provider
   */
  registerProvider(provider: ITokenProvider): void {
    this.registry.registerProvider(provider);
    this.tokenTool.registerProvider(provider);

    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): ITokenProvider[] {
    return this.registry.getProvidersByNetwork('*');
  }

  /**
   * Get providers for a specific network
   */
  getProvidersForNetwork(network: NetworkName): ITokenProvider[] {
    return this.registry.getProvidersByNetwork(network);
  }

  /**
   * Get all supported networks
   */
  getSupportedNetworks(): NetworkName[] {
    return Array.from(this.supportedNetworks);
  }

  /**
   * Refresh token price information
   * This will fetch the latest price from available providers without modifying the default token list
   */
  async refreshTokenPrice(network: NetworkName, address: string): Promise<TokenInfo> {
    return this.tokenTool.refreshTokenPrice(network, address);
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
