import { NetworkName } from '@binkai/core';
import { IBridgeProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, IBridgeProvider> = new Map();

  registerProvider(provider: IBridgeProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): IBridgeProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProviders(): IBridgeProvider[] {
    return Array.from(this.providers.values());
  }

  getProvidersByNetwork(network: NetworkName | '*'): IBridgeProvider[] {
    if (network === '*') {
      return this.getProviders();
    }
    return this.getProviders().filter(provider =>
      provider.getSupportedNetworks().includes(network),
    );
  }
}
