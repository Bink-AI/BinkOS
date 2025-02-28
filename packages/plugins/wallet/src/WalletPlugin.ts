import { BasePlugin, IPluginConfig, NetworkName } from '@binkai/core';
import { GetWalletBalanceTool } from './WalletBalanceTool';
import { TransferTool } from './TransferTool';
import { IWalletProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';

export interface WalletPluginConfig extends IPluginConfig {
  defaultNetwork?: string;
  providers?: IWalletProvider[];
  supportedNetworks?: string[];
}

export class WalletPlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private walletTool!: GetWalletBalanceTool;
  private transferTool!: TransferTool;
  private supportedNetworks: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set();
  }

  async initialize(config: WalletPluginConfig): Promise<void> {
    if (config.supportedNetworks) {
      config.supportedNetworks.forEach(chain => this.supportedNetworks.add(chain));
    }

    this.walletTool = new GetWalletBalanceTool({
      defaultNetwork: config.defaultNetwork,
      supportedNetworks: Array.from(this.supportedNetworks),
    });

    this.transferTool = new TransferTool({
      defaultNetwork: config.defaultNetwork,
      supportedNetworks: Array.from(this.supportedNetworks),
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
    this.transferTool.registerProvider(provider);
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getProviders(): IWalletProvider[] {
    return this.registry.getProvidersByNetwork('*');
  }

  getProvidersForNetwork(network: NetworkName): IWalletProvider[] {
    return this.registry.getProvidersByNetwork(network);
  }

  getSupportedChain(): string[] {
    return Array.from(this.supportedNetworks);
  }

  getName(): string {
    return 'wallet';
  }

  getTools() {
    return [this.walletTool, this.transferTool];
  }
}
