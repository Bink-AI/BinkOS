import { StakingTool } from './StakingTool';
import { IStakingProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';
import { BaseTool, IPluginConfig, BasePlugin } from '@binkai/core';

export interface StakingPluginConfig extends IPluginConfig {
  defaultChain?: string;
  providers?: IStakingProvider[];
  supportedChains?: string[];
}

export class StakingPlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private stakingTool!: StakingTool;
  private supportedChains: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedChains = new Set();
  }

  getName(): string {
    return 'staking';
  }

  async initialize(config: StakingPluginConfig): Promise<void> {
    // Initialize supported chains
    if (config.supportedChains) {
      config.supportedChains.forEach(chain => this.supportedChains.add(chain));
    }

    // Configure staking tool
    this.stakingTool = new StakingTool({
      defaultChain: config.defaultChain,
      supportedChains: Array.from(this.supportedChains),
    });

    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools(): BaseTool[] {
    return [this.stakingTool as unknown as BaseTool];
  }

  /**
   * Register a new staking provider
   */
  registerProvider(provider: IStakingProvider): void {
    this.registry.registerProvider(provider);
    this.stakingTool.registerProvider(provider);

    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): IStakingProvider[] {
    return this.registry.getProvidersByChain('*');
  }

  /**
   * Get providers for a specific chain
   */
  getProvidersForChain(chain: string): IStakingProvider[] {
    return this.registry.getProvidersByChain(chain);
  }

  /**
   * Get all supported chains
   */
  getSupportedChains(): string[] {
    return Array.from(this.supportedChains);
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
