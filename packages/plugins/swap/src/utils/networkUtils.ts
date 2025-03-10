import { NetworkName } from '@binkai/core';
import { Provider } from 'ethers';
import { Connection } from '@solana/web3.js';
import { NetworkProvider } from '../types';

/**
 * Checks if a network is a Solana network
 * @param network The network to check
 * @returns True if the network is a Solana network, false otherwise
 */
export function isSolanaNetwork(network: NetworkName): boolean {
  return network === NetworkName.SOLANA || network === NetworkName.SOLANA_DEVNET;
}

/**
 * Checks if a provider is an EVM provider
 * @param provider The provider to check
 * @returns True if the provider is an EVM provider, false otherwise
 */
export function isProviderInstance(provider: NetworkProvider): provider is Provider {
  return 'getNetwork' in provider && 'getBlockNumber' in provider;
}

/**
 * Checks if a provider is a Solana provider
 * @param provider The provider to check
 * @returns True if the provider is a Solana provider, false otherwise
 */
export function isSolanaProvider(provider: NetworkProvider): provider is Connection {
  return provider instanceof Connection;
}

/**
 * Gets the EVM provider for a specific network
 * @param providers The map of providers
 * @param network The network to get the provider for
 * @param providerName The name of the provider (for error messages)
 * @returns The EVM provider for the specified network
 * @throws Error if the network is not supported or if it's not an EVM network
 */
export function getEvmProviderForNetwork(
  providers: Map<NetworkName, NetworkProvider>,
  network: NetworkName,
  providerName: string,
): Provider {
  const provider = providers.get(network);
  if (!provider) {
    throw new Error(`Network ${network} is not supported by ${providerName}`);
  }
  if (!isProviderInstance(provider)) {
    throw new Error(`Network ${network} does not have an EVM provider`);
  }
  return provider;
}

/**
 * Gets the Solana provider for a specific network
 * @param providers The map of providers
 * @param network The network to get the provider for
 * @param providerName The name of the provider (for error messages)
 * @returns The Solana provider for the specified network
 * @throws Error if the network is not supported or if it's not a Solana network
 */
export function getSolanaProviderForNetwork(network: NetworkName): Connection {
  const provider = new Connection('https://api.mainnet-beta.solana.com');
  if (!provider) {
    throw new Error(`Network ${network} is not supported `);
  }
  return provider;
}

/**
 * Checks if a network is supported by a provider
 * @param supportedNetworks The list of supported networks
 * @param providers The map of providers
 * @param network The network to check
 * @returns True if the network is supported, false otherwise
 */
export function isNetworkSupported(
  supportedNetworks: NetworkName[],
  providers: Map<NetworkName, NetworkProvider>,
  network: NetworkName,
): boolean {
  return supportedNetworks.includes(network) && providers.has(network);
}

/**
 * Validates if a network is supported
 * @param supportedNetworks The list of supported networks
 * @param providers The map of providers
 * @param network The network to validate
 * @param providerName The name of the provider (for error messages)
 * @throws Error if the network is not supported
 */
export function validateNetwork(
  supportedNetworks: NetworkName[],
  providers: Map<NetworkName, NetworkProvider>,
  network: NetworkName,
  providerName: string,
): void {
  if (!isNetworkSupported(supportedNetworks, providers, network)) {
    throw new Error(`Network ${network} is not supported by ${providerName}`);
  }
}
