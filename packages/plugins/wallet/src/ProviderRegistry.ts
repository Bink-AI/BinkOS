import { IWalletProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, IWalletProvider> = new Map();

  /**
   * Register a new wallet provider
   * @param provider The wallet provider to register
   */
  registerProvider(provider: IWalletProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  /**
   * Get a provider by name
   * @param name The name of the provider to get
   * @returns The provider instance
   * @throws Error if provider not found
   */
  getProvider(name: string): IWalletProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  /**
   * Get all registered provider names
   * @returns Array of provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all providers that support a specific chain
   * If chain is '*', returns all providers
   * @param chain The blockchain network to filter by
   * @returns Array of providers that support the chain
   */
  getProvidersByChain(chain: string): IWalletProvider[] {
    if (chain === '*') {
      return Array.from(this.providers.values());
    }
    return Array.from(this.providers.values()).filter(provider =>
      provider.getSupportedChains().includes(chain),
    );
  }

  /**
   * Get all registered providers
   * @returns Array of all provider instances
   */
  getAllProviders(): IWalletProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if a provider exists
   * @param name The name of the provider to check
   * @returns boolean indicating if the provider exists
   */
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Remove a provider from the registry
   * @param name The name of the provider to remove
   */
  removeProvider(name: string): void {
    this.providers.delete(name);
  }

  /**
   * Clear all registered providers
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Get the number of registered providers
   * @returns The count of registered providers
   */
  get size(): number {
    return this.providers.size;
  }
}
