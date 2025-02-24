import { IStakingProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, IStakingProvider> = new Map();

  registerProvider(provider: IStakingProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): IStakingProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProviders(): IStakingProvider[] {
    return Array.from(this.providers.values());
  }

  getProvidersByChain(chain: string): IStakingProvider[] {
    return Array.from(this.providers.values()).filter(provider =>
      provider.getSupportedChains().includes(chain),
    );
  }
}
