import {
  EVM_NATIVE_TOKEN_ADDRESS,
  NetworkName,
  SOL_NATIVE_TOKEN_ADDRESS,
  SOL_NATIVE_TOKEN_ADDRESS2,
  Token,
} from '@binkai/core';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  getEvmProviderForNetwork,
  getSolanaProviderForNetwork,
  isSolanaNetwork,
  validateNetwork,
} from './networkUtils';

// Default cache TTL (30 minutes)
export const DEFAULT_CACHE_TTL = 30 * 60 * 1000;

// Default balance cache TTL (1 minute - shorter than token info since balances change more frequently)
export const DEFAULT_BALANCE_CACHE_TTL = 60 * 1000;

/**
 * Gets token information from the blockchain
 * @param tokenAddress The address of the token
 * @param network The network to get the token info from
 * @param provider The provider to use
 * @returns A promise that resolves to the token information
 */
export async function getTokenInfo(
  tokenAddress: string,
  network: NetworkName,
  provider: Provider,
): Promise<Token> {
  const erc20Interface = new Interface([
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ]);

  const contract = new Contract(tokenAddress, erc20Interface, provider);
  const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);

  return {
    address: tokenAddress.toLowerCase() as `0x${string}`,
    decimals: Number(decimals),
    symbol,
  };
}

export async function getTokenInfoSolana(
  tokenAddress: string,
  network: NetworkName,
): Promise<Token> {
  const connection = getSolanaProviderForNetwork(network);
  const tokenMint = new PublicKey(tokenAddress);
  const tokenInfo = await connection.getParsedAccountInfo(tokenMint);

  if (!tokenInfo.value || !('parsed' in tokenInfo.value.data)) {
    throw new Error(`Invalid token info for ${tokenAddress} on ${network}`);
  }

  const parsedData = tokenInfo.value.data.parsed;
  if (!('info' in parsedData)) {
    throw new Error(`Missing token info for ${tokenAddress}`);
  }

  const { decimals, symbol } = parsedData.info;

  return {
    address: tokenAddress,
    decimals: Number(decimals),
    symbol,
  };
}

/**
 * Creates a token cache manager
 * @param cacheTTL The time-to-live for cache entries in milliseconds
 * @returns An object with methods to get and cache tokens
 */
export function createTokenCache(cacheTTL: number = DEFAULT_CACHE_TTL) {
  const tokenCache = new Map<string, { token: Token; timestamp: number }>();

  return {
    /**
     * Gets a token from the cache or fetches it from the blockchain
     * @param tokenAddress The address of the token
     * @param network The network to get the token from
     * @param providers The map of providers
     * @param providerName The name of the provider (for error messages)
     * @returns A promise that resolves to the token
     */
    async getToken(
      tokenAddress: string,
      network: NetworkName,
      providers: Map<NetworkName, Provider | Connection>,
      providerName: string,
    ): Promise<Token> {
      validateNetwork(Array.from(providers.keys()), providers, network, providerName);

      if (isSolanaNetwork(network)) {
        // TODO: Implement Solana
        //throw new Error('Solana not implemented yet');

        const now = Date.now();
        const cacheKey = `${network}:${tokenAddress}`;
        const cached = tokenCache.get(cacheKey);

        if (cached && now - cached.timestamp < cacheTTL) {
          return cached.token;
        }

        console.log('🤖 getToken Solana ', tokenAddress);

        const connection = getSolanaProviderForNetwork(network);
        //const connection = new Connection(network);
        const tokenMint = new PublicKey(tokenAddress);
        const tokenInfo = await connection.getParsedAccountInfo(tokenMint);

        if (!tokenInfo.value || !('parsed' in tokenInfo.value.data)) {
          throw new Error(`Invalid token info for ${tokenAddress} on ${network}`);
        }

        const parsedData = tokenInfo.value.data.parsed;
        if (!('info' in parsedData)) {
          throw new Error(`Missing token info for ${tokenAddress}`);
        }

        const { decimals, symbol } = parsedData.info;
        const token = {
          address: tokenAddress,
          decimals: Number(decimals),
          symbol,
        };
        tokenCache.set(cacheKey, { token, timestamp: now });
        return token;
      }

      const now = Date.now();
      const cacheKey = `${network}:${tokenAddress}`;
      const cached = tokenCache.get(cacheKey);

      if (cached && now - cached.timestamp < cacheTTL) {
        return cached.token;
      }

      const provider = getEvmProviderForNetwork(providers, network, providerName);
      let info: Token;
      if (isNativeToken(tokenAddress, EVM_NATIVE_TOKEN_ADDRESS)) {
        info = {
          address: tokenAddress.toLowerCase() as `0x${string}`,
          decimals: 18,
          symbol: '',
        };
      } else {
        info = await getTokenInfo(tokenAddress, network, provider);
      }
      const token = {
        address: info.address.toLowerCase() as `0x${string}`,
        decimals: info.decimals,
        symbol: info.symbol,
      };

      tokenCache.set(cacheKey, { token, timestamp: now });
      return token;
    },

    /**
     * Clears expired entries from the cache
     */
    clearExpiredEntries(): void {
      const now = Date.now();
      for (const [key, value] of tokenCache.entries()) {
        if (now - value.timestamp > cacheTTL) {
          tokenCache.delete(key);
        }
      }
    },
  };
}

/**
 * Interface for token balance cache entry
 */
interface TokenBalanceCacheEntry {
  balance: bigint;
  formattedBalance: string;
  timestamp: number;
}

/**
 * Creates a token balance cache manager
 * @param balanceCacheTTL The time-to-live for balance cache entries in milliseconds
 * @returns An object with methods to get and cache token balances
 */
export function createTokenBalanceCache(balanceCacheTTL: number = DEFAULT_BALANCE_CACHE_TTL) {
  const balanceCache = new Map<string, TokenBalanceCacheEntry>();

  return {
    /**
     * Gets a token balance from the cache or fetches it from the blockchain
     * @param tokenAddress The address of the token
     * @param walletAddress The address of the wallet
     * @param network The network to get the balance from
     * @param providers The map of providers
     * @param providerName The name of the provider (for error messages)
     * @param decimals The token decimals (optional, will be fetched if not provided)
     * @returns A promise that resolves to the token balance (both bigint and formatted string)
     */
    async getTokenBalance(
      tokenAddress: string,
      walletAddress: string,
      network: NetworkName,
      providers: Map<NetworkName, Provider | Connection>,
      providerName: string,
      decimals?: number,
    ): Promise<{ balance: bigint; formattedBalance: string }> {
      validateNetwork(Array.from(providers.keys()), providers, network, providerName);

      const now = Date.now();
      const cacheKey = `${network}:${tokenAddress}:${walletAddress}`;
      const cached = balanceCache.get(cacheKey);

      // Return cached balance if it's still valid
      if (cached && now - cached.timestamp < balanceCacheTTL) {
        return {
          balance: cached.balance,
          formattedBalance: cached.formattedBalance,
        };
      }

      if (isSolanaNetwork(network)) {
        // TODO: Implement Solana
        //throw new Error('Solana not implemented yet');

        const provider = getSolanaProviderForNetwork(network);
        //const provider = new Connection(network);
        const isNative =
          tokenAddress.toLowerCase() === SOL_NATIVE_TOKEN_ADDRESS.toLowerCase() ||
          tokenAddress.toLowerCase() === SOL_NATIVE_TOKEN_ADDRESS2.toLowerCase();
        const wallet = new PublicKey(walletAddress);
        const tokenMint = new PublicKey(tokenAddress);
        let rawBalance;
        let decimals;
        if (isNative) {
          // For native tokens
          decimals = 9;
          rawBalance = await provider.getBalance(wallet);
        } else {
          const tokenAccounts = await provider.getParsedTokenAccountsByOwner(wallet, {
            mint: tokenMint,
          });

          const mintInfo = await provider.getParsedAccountInfo(tokenMint);

          if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
            throw new Error('Invalid mint account');
          }

          decimals = mintInfo?.value?.data?.parsed?.info?.decimals;
          rawBalance = tokenAccounts?.value[0]?.account?.data?.parsed?.info?.tokenAmount?.amount;
        }
        const balance = ethers.formatUnits(rawBalance, decimals);
        // Cache the result
        balanceCache.set(cacheKey, {
          balance: BigInt(rawBalance),
          formattedBalance: balance,
          timestamp: now,
        });

        return {
          balance: BigInt(rawBalance),
          formattedBalance: balance,
        };
      }

      const provider = getEvmProviderForNetwork(providers, network, providerName);

      // Check if it's a native token (using address comparison)
      const isNative =
        tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase() ||
        tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000';

      let balance: bigint;
      let tokenDecimals = decimals;

      if (isNative) {
        // For native tokens
        balance = await provider.getBalance(walletAddress);
        tokenDecimals = tokenDecimals || 18; // Default to 18 decimals for native tokens
      } else {
        // For ERC20 tokens
        const erc20Interface = new Interface([
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)',
        ]);

        const contract = new Contract(tokenAddress, erc20Interface, provider);

        // If decimals not provided, fetch them
        if (!tokenDecimals) {
          tokenDecimals = Number(await contract.decimals());
        }

        balance = await contract.balanceOf(walletAddress);
      }

      const formattedBalance = ethers.formatUnits(balance, tokenDecimals);

      // Cache the result
      balanceCache.set(cacheKey, {
        balance,
        formattedBalance,
        timestamp: now,
      });

      return { balance, formattedBalance };
    },

    /**
     * Invalidates a specific token balance in the cache
     * @param tokenAddress The address of the token
     * @param walletAddress The address of the wallet
     * @param network The network
     */
    invalidateBalance(tokenAddress: string, walletAddress: string, network: NetworkName): void {
      const cacheKey = `${network}:${tokenAddress}:${walletAddress}`;
      balanceCache.delete(cacheKey);
    },

    /**
     * Clears all expired entries from the cache
     */
    clearExpiredEntries(): void {
      const now = Date.now();
      for (const [key, value] of balanceCache.entries()) {
        if (now - value.timestamp > balanceCacheTTL) {
          balanceCache.delete(key);
        }
      }
    },

    /**
     * Clears the entire balance cache
     */
    clearAllBalances(): void {
      balanceCache.clear();
    },
  };
}

/**
 * Checks if a token is a native token
 * @param tokenAddress The address of the token
 * @param nativeTokenAddress The address of the native token
 * @returns True if the token is a native token, false otherwise
 */
export function isNativeToken(tokenAddress: string, nativeTokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === nativeTokenAddress.toLowerCase();
}
