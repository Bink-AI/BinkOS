import { BasePlugin, IPluginConfig } from '@binkai/core';
import { GetWalletBalanceTool } from './WalletBalanceTool';
import { IWalletProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';

export interface WalletPluginConfig extends IPluginConfig {
  defaultChain?: string;
  providers?: IWalletProvider[];
  supportedChains?: string[];
}

export class WalletPlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private walletTool!: GetWalletBalanceTool;
  private supportedChains: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedChains = new Set();
  }

  async initialize(config: WalletPluginConfig): Promise<void> {
    if (config.supportedChains) {
      config.supportedChains.forEach(chain => this.supportedChains.add(chain));
    }

    this.walletTool = new GetWalletBalanceTool({
      defaultChain: config.defaultChain,
      supportedChains: Array.from(this.supportedChains),
    });

    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  registerProvider(provider: IWalletProvider): void {
    this.registry.registerProvider(provider);
    this.walletTool.registerProvider(provider);
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  getProviders(): IWalletProvider[] {
    return this.registry.getProvidersByChain('*');
  }

  getProvidersForChain(chain: string): IWalletProvider[] {
    return this.registry.getProvidersByChain(chain);
  }

  getSupportedChains(): string[] {
    return Array.from(this.supportedChains);
  }

  getName(): string {
    return 'wallet';
  }

  getTools() {
    return [this.walletTool];
  }
}
