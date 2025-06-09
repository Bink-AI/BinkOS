import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  AgentNodeTypes,
  BaseTool,
  CustomDynamicStructuredTool,
  IToolConfig,
  NetworkName,
  ToolProgress,
  ErrorStep,
  logger,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ITokenProvider, TokenInfo, TokenQueryParams } from './types';
import { DefaultTokenProvider } from './providers/DefaultTokenProvider';
import { defaultTokens } from './data/defaultTokens';
import { roundNumber } from './utils/formatting';

export interface GetTokenInfoToolConfig extends IToolConfig {
  supportedNetworks?: NetworkName[];
}

export class GetTokenInfoTool extends BaseTool {
  public registry: ProviderRegistry;
  private supportedNetworks: Set<NetworkName>;
  private defaultTokenProvider: DefaultTokenProvider;
  // Cache for token information to avoid modifying default tokens
  private tokenCache: Partial<Record<NetworkName, Record<string, TokenInfo>>> = {};

  constructor(config: GetTokenInfoToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set<NetworkName>(config.supportedNetworks || []);

    // Initialize default token provider
    this.defaultTokenProvider = new DefaultTokenProvider();

    // Register the default token provider first
    this.registerProvider(this.defaultTokenProvider);
    logger.info(
      '📚 Default token provider registered with',
      Object.keys(defaultTokens).length,
      'networks and',
      Object.values(defaultTokens).reduce((acc, tokens) => acc + Object.keys(tokens).length, 0),
      'tokens',
    );

    // Initialize token cache for each network
    this.defaultTokenProvider.getSupportedNetworks().forEach(network => {
      this.tokenCache[network] = {};
    });
  }

  registerProvider(provider: ITokenProvider): void {
    this.registry.registerProvider(provider);
    logger.info('🔌 Provider registered:', provider.constructor.name);
    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
      // Initialize token cache for this network if it doesn't exist
      if (!this.tokenCache[network]) {
        this.tokenCache[network] = {};
      }
    });
  }

  getName(): string {
    return 'get_token_info';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Query token information including prices, symbols, and details using various providers (${providers}). Supports networks: ${networks}. You can query by token address or symbol (like "BTC", "ETH", "USDT", etc). Use this tool to get current token prices and information.`;
  }

  private getSupportedNetworks(): NetworkName[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks()) as NetworkName[];

    // Intersect with supported networks from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported networks
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  mockResponseTool(args: any): Promise<string> {
    return Promise.resolve(
      JSON.stringify({
        status: args.status,
      }),
    );
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No token providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      query: z.string().describe('The token address or symbol to query'),
      network: z
        .enum([
          'bnb',
          'solana',
          'ethereum',
          'arbitrum',
          'base',
          'optimism',
          'polygon',
          'hyperliquid',
          'null',
        ])
        .describe('The blockchain network to query the token on'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The provider to use for querying. If not specified, all available providers will be tried',
        ),
      includePrice: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include price information in the response'),
    });
  }

  private normalizeAddress(address: string, network: NetworkName): string {
    // For Solana networks, keep the original case
    if (network === NetworkName.SOLANA || network === NetworkName.SOLANA_DEVNET) {
      return address;
    }

    // For EVM networks, lowercase the address
    return address.toLowerCase();
  }


  // Get cache key for token
  private getCacheKey(address: string, network: NetworkName): string {
    return this.normalizeAddress(address, network);
  }

  // Update the token cache
  private updateTokenCache(network: NetworkName, token: TokenInfo): void {
    const cacheKey = this.getCacheKey(token.address, network);

    if (!this.tokenCache[network]) {
      this.tokenCache[network] = {};
    }

    // Store the token with current timestamp and network
    this.tokenCache[network][cacheKey] = {
      ...token,
      network,
      priceUpdatedAt: token.priceUpdatedAt || Date.now(),
    };
  }

  // Get token from cache
  private getTokenFromCache(network: NetworkName, address: string): TokenInfo | null {
    const cacheKey = this.getCacheKey(address, network);

    if (!this.tokenCache[network] || !this.tokenCache[network][cacheKey]) {
      return null;
    }

    return this.tokenCache[network][cacheKey];
  }

  private async fetchTokenPrice(tokenInfo: TokenInfo, network: NetworkName): Promise<TokenInfo> {
    // Check if we have fresh token data in the cache
    const cachedToken = this.getTokenFromCache(network, tokenInfo.address);
    if (cachedToken?.price?.usd && !this.isPriceStale(cachedToken.priceUpdatedAt)) {
      // Use cached token data
      logger.info(`💰 Using cached price for ${tokenInfo.symbol}: $${cachedToken.price.usd}`);
      return cachedToken;
    }

    logger.info(`🔄 Fetching price for ${tokenInfo.symbol || tokenInfo.address} on ${network}`);

    const providers = this.registry.getProvidersByNetwork(network);
    if (providers.length <= 1) {
      // Only default provider available or no providers
      logger.info(`⚠️ No price providers available for ${network}, using default token info`);
      return { ...tokenInfo, network };
    }

    // Try each external provider to get price information
    for (const provider of providers) {
      // Skip the default provider as we already have the token info
      if (provider.getName() === this.defaultTokenProvider.getName()) {
        continue;
      }

      logger.info(`🔍 Trying to get price from ${provider.getName()}`);
      try {
        // Query the provider using the token address
        const updatedTokenInfo = await provider.getTokenInfo({
          query: tokenInfo.address,
          network,
          includePrice: true,
        });

        // If we got price information, update our cache
        if (updatedTokenInfo?.price?.usd) {
          // Round the price for display
          const roundedPrice = roundNumber(updatedTokenInfo?.price?.usd, 6);

          // Create a merged token with base info from original and price from updated
          const mergedToken: TokenInfo = {
            ...tokenInfo,
            network,
            price: {
              ...updatedTokenInfo?.price,
              usd: roundedPrice,
            },
            priceUpdatedAt: Date.now(),
            priceChange24h: roundNumber(updatedTokenInfo?.priceChange24h, 2),
            volume24h: roundNumber(updatedTokenInfo?.volume24h, 0),
            marketCap: roundNumber(updatedTokenInfo?.marketCap, 0),
          };

          // Update the token cache
          this.updateTokenCache(network, mergedToken);

          return mergedToken;
        }
      } catch (error: any) {
        logger.warn(`⚠️ Failed to get price from ${provider.getName()}:`, error);
        continue;
      }
    }

    // If we couldn't get price from any provider, return the original token with network
    logger.info(`⚠️ Could not get price for ${tokenInfo.symbol} from any provider`);
    return { ...tokenInfo, network };
  }

  // Check if the price data is stale (older than 1 hour)
  private isPriceStale(timestamp?: number): boolean {
    if (!timestamp) return true;

    const oneHourAgo = Date.now() - 60 * 60 * 1000; // 1 hour in milliseconds
    return timestamp < oneHourAgo;
  }

  private async queryToken(params: TokenQueryParams): Promise<TokenInfo> {
    // Validate network is supported
    const providers = this.registry.getProvidersByNetwork(params.network);
    if (providers.length === 0) {
      logger.error(`❌ No providers available for network ${params.network}`);
      throw new Error(`No providers available for network ${params.network}`);
    }

    // Try default provider first
    try {
      logger.info(`🔍 Searching for token ${params.query} in default list`);
      let tokenInfo = await this.defaultTokenProvider.getTokenInfo({
        ...params,
        includePrice: false, // Don't require price from default provider
      });

      logger.info(`✅ Token found in default list: ${params.query} (${tokenInfo.symbol})`);

      // Check if we have this token in our cache
      const cachedToken = this.getTokenFromCache(params.network, tokenInfo.address);
      if (cachedToken) {
        // If we have a cached token and price is not requested or not stale, use it
        if (
          !params.includePrice ||
          (cachedToken.price?.usd && !this.isPriceStale(cachedToken.priceUpdatedAt))
        ) {
          logger.info(`💾 Using cached token data for ${tokenInfo.symbol}`);
          return cachedToken;
        }
      }

      // If price is requested, try to fetch it from other providers
      if (params.includePrice) {
        logger.info(`🔄 Fetching price data for ${tokenInfo.symbol}`);
        tokenInfo = await this.fetchTokenPrice(tokenInfo, params.network);
      }

      return tokenInfo;
    } catch (error: any) {
      logger.info(`⚠️ Token not found in default list, trying external providers...`);
    }

    // If default provider fails, try each external provider until we get a result
    let lastError: Error | undefined;

    for (const provider of providers) {
      // Skip the default provider as we already tried it
      if (provider.getName() === this.defaultTokenProvider.getName()) {
        continue;
      }

      logger.info(`🔍 Trying to get token info from ${provider.getName()}`);
      try {
        const tokenInfo = await provider.getTokenInfo(params);
        logger.info(`✅ Found token info from ${provider.getName()}`);

        // Store the complete token in our cache
        this.updateTokenCache(params.network, tokenInfo);
        logger.info(`💾 Token data cached for ${tokenInfo.symbol || params.query}`);

        return tokenInfo;
      } catch (error: any) {
        logger.warn(`⚠️ Failed to get token info from ${provider.getName()}:`, error);
        lastError = error as Error;
        continue;
      }
    }

    logger.error(`❌ No provider could find information for token ${params.query}`);
    throw new Error(
      `No provider could find information for token ${params.query} on network ${params.network}. Last error: ${lastError?.message}`,
    );
  }

  // Method to manually refresh price for a token
  async refreshTokenPrice(network: NetworkName, address: string): Promise<TokenInfo> {
    // First check if we have this token in our cache
    const cachedToken = this.getTokenFromCache(network, address);

    // If we have a cached token, use it as the base
    if (cachedToken) {
      // Force refresh price from external providers
      const updatedToken = await this.fetchTokenPrice(cachedToken, network);

      // Ensure all numeric values are properly rounded
      if (updatedToken?.price?.usd) {
        updatedToken.price.usd = roundNumber(updatedToken?.price?.usd, 6);
      }
      updatedToken.priceChange24h = roundNumber(updatedToken?.priceChange24h, 2);
      updatedToken.volume24h = roundNumber(updatedToken?.volume24h, 0);
      updatedToken.marketCap = roundNumber(updatedToken?.marketCap, 0);

      return updatedToken;
    }

    // If not in cache, get the token from default provider
    try {
      const tokenInfo = await this.defaultTokenProvider.getTokenInfo({
        query: address,
        network,
        includePrice: false,
      });

      // Force refresh price from external providers
      const updatedToken = await this.fetchTokenPrice(tokenInfo, network);

      // Ensure all numeric values are properly rounded
      if (updatedToken?.price?.usd) {
        updatedToken.price.usd = roundNumber(updatedToken?.price?.usd, 6);
      }
      updatedToken.priceChange24h = roundNumber(updatedToken?.priceChange24h, 2);
      updatedToken.volume24h = roundNumber(updatedToken?.volume24h, 0);
      updatedToken.marketCap = roundNumber(updatedToken?.marketCap, 0);

      return updatedToken;
    } catch (error: any) {
      throw new Error(
        `Failed to refresh price: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }


  async findHyperLiquidToken(query: string, network: NetworkName): Promise<TokenInfo> {
    try {
      const response = await fetch('https://api-ui.hyperliquid.xyz/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'spotMeta',
        }),
      });

      const parseResponse = await response.json();
      const allTokens = parseResponse.tokens;

      const hyperTokenInfo = allTokens.find(
        (t: any) =>
          t.name?.toLowerCase() === query.toLowerCase() ||
          t.tokenId?.toLowerCase() === query.toLowerCase(),
      );

      const tokenInfo: TokenInfo = {
        address: hyperTokenInfo.tokenId || '',
        symbol: hyperTokenInfo.name,
        name: hyperTokenInfo.fullName || hyperTokenInfo.name,
        decimals: hyperTokenInfo.weiDecimals,
        network: network as NetworkName,
      };

      return tokenInfo as TokenInfo;
    } catch (error) {
      console.error(`Error in findToken in  hyperliquid provider: ${error}`);
      throw error;
    }
  }

  createTool(): CustomDynamicStructuredTool {
    logger.info('🛠️ Creating token info tool');
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (
        args: any,
        runManager?: any,
        config?: any,
        onProgress?: (data: ToolProgress) => void,
      ) => {
        try {
          let { query, network, provider: preferredProvider, includePrice = true } = args;

          logger.info(`🔍 Searching for token "${query}" on ${network} network`);
          logger.info('📋 Token Tool Args:', args);

          // Special handling for hyperliquid network
          if (network === 'hyperliquid') {
            logger.info('🔥 Using Hyperliquid API for token search');
            onProgress?.({
              progress: 50,
              message: `Searching for token "${query}" on Hyperliquid network.`,
            });

            try {
              const tokenInfo = await this.findHyperLiquidToken(query, network);
              logger.info(`✅ Found token info from Hyperliquid API: ${tokenInfo.symbol}`);

              onProgress?.({
                progress: 100,
                message: `Successfully retrieved information for ${tokenInfo.name || tokenInfo.symbol || query} from Hyperliquid.`,
              });

              return JSON.stringify({
                status: 'success',
                data: tokenInfo,
                provider: 'hyperliquid',
                network,
              });
            } catch (error: any) {
              logger.error(`❌ Could not find token "${query}" on Hyperliquid`);
              throw this.createError(
                ErrorStep.TOKEN_NOT_FOUND,
                `Could not find token "${query}" on Hyperliquid network.`,
                {
                  query: query,
                  network: network,
                  provider: 'hyperliquid',
                  error: error instanceof Error ? error.message : String(error),
                },
              );
            }
          }


          onProgress?.({
            progress: 20,
            message: `Searching for token information for "${query}" on ${network} network.`,
          });

          // STEP 1: Validate network is supported
          const supportedNetworks = this.getSupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            logger.error(`❌ Network ${network} is not supported`);
            throw this.createError(
              ErrorStep.NETWORK_VALIDATION,
              `Network ${network} is not supported.`,
              {
                requestedNetwork: network,
                supportedNetworks: supportedNetworks,
              },
            );
          }

          let tokenInfo: TokenInfo;

          if (preferredProvider) {
            logger.info(`🔍 Using specific provider: ${preferredProvider}`);
            onProgress?.({
              progress: 50,
              message: `Querying token information from ${preferredProvider} provider.`,
            });

            // STEP 2: Validate provider
            const provider = this.registry.getProvider(preferredProvider);

            // Validate provider supports the network
            if (!provider.getSupportedNetworks().includes(network)) {
              logger.error(`❌ Provider ${preferredProvider} does not support network ${network}`);
              throw this.createError(
                ErrorStep.PROVIDER_VALIDATION,
                `Provider ${preferredProvider} does not support network ${network}.`,
                {
                  requestedProvider: preferredProvider,
                  network: network,
                  availableProviders: this.registry
                    .getProvidersByNetwork(network)
                    .map(p => p.getName()),
                },
              );
            }

            // STEP 3: Query token info from specific provider
            try {
              logger.info(`🔄 Querying token info from ${preferredProvider}`);
              tokenInfo = await provider.getTokenInfo({ query, network, includePrice });
              logger.info(`✅ Found token info from ${preferredProvider}`);
            } catch (error: any) {
              logger.error(`❌ Provider ${preferredProvider} could not find token "${query}"`);
              throw this.createError(
                ErrorStep.TOKEN_NOT_FOUND,
                `Provider ${preferredProvider} could not find token "${query}" on network ${network}.`,
                {
                  query: query,
                  network: network,
                  provider: preferredProvider,
                  error: error instanceof Error ? error.message : String(error),
                },
              );
            }

            // STEP 4: Handle price retrieval if needed
            if (preferredProvider === this.defaultTokenProvider.getName() && includePrice) {
              try {
                logger.info(`🔄 Fetching price data for ${tokenInfo.symbol || query}`);
                tokenInfo = await this.fetchTokenPrice(tokenInfo, network);

                // Check if price was actually retrieved
                if (includePrice && !tokenInfo.price?.usd) {
                  logger.warn(
                    `⚠️ Could not retrieve price for ${tokenInfo.symbol || query} on ${network}`,
                  );
                  // Not throwing error here, just continuing with the token info we have
                }
              } catch (error: any) {
                logger.warn(
                  `⚠️ Error fetching price: ${error instanceof Error ? error.message : String(error)}`,
                );
                // Not throwing error here, just continuing with the token info we have
              }
            } else {
              // For non-default providers, update our cache
              this.updateTokenCache(network, tokenInfo);
              logger.info(`💾 Token data cached for ${tokenInfo.symbol || query}`);
            }
          } else {
            logger.info(`🔍 Searching across all available providers`);
            onProgress?.({
              progress: 50,
              message: `Searching for token information across all available providers.`,
            });

            // STEP 3: Query token info from all providers
            try {
              tokenInfo = await this.queryToken({
                query,
                network,
                includePrice,
              });
              logger.info(`✅ Found token info for ${query}`);
            } catch (error: any) {
              logger.error(`❌ Could not find token "${query}" on network ${network}`);
              throw this.createError(
                ErrorStep.TOKEN_NOT_FOUND,
                `Could not find token "${query}" on network ${network} using any provider.`,
                {
                  query: query,
                  network: network,
                  providers: this.registry.getProvidersByNetwork(network).map(p => p.getName()),
                  error: error instanceof Error ? error.message : String(error),
                },
              );
            }
          }

          // Ensure all numeric values are properly rounded before returning
          if (tokenInfo?.price?.usd) {
            tokenInfo.price.usd = roundNumber(tokenInfo?.price?.usd, 6);
          }

          tokenInfo.priceChange24h = roundNumber(tokenInfo?.priceChange24h, 2);
          tokenInfo.volume24h = roundNumber(tokenInfo?.volume24h, 0);
          tokenInfo.marketCap = roundNumber(tokenInfo?.marketCap, 0);

          logger.info(
            `💰 Token info retrieved: ${tokenInfo.symbol || query} ${tokenInfo?.price?.usd ? `($${tokenInfo?.price?.usd})` : ''}`,
          );

          onProgress?.({
            progress: 100,
            message: `Successfully retrieved information for ${tokenInfo.name || tokenInfo.symbol || query}${tokenInfo?.price?.usd ? ` (Current price: $${tokenInfo?.price?.usd})` : ''}.`,
          });

          if (!tokenInfo.verified) {
            if (tokenInfo.buyTax !== '0' && tokenInfo.buyTax !== undefined) {
              tokenInfo.buyTax +=
                ' - Transfer fee will cause the actual value received when transferring a token to be less than expected, and high transfer fee may lead to large losses.';
            }
            if (
              tokenInfo.canTakeBackOwnership !== '0' &&
              tokenInfo.canTakeBackOwnership !== undefined
            ) {
              tokenInfo.canTakeBackOwnership +=
                ' - Owner can regain ownership to manipulate the contract.';
            }
            if (tokenInfo.hiddenOwner !== '0' && tokenInfo.hiddenOwner !== undefined) {
              tokenInfo.hiddenOwner +=
                ' - Anonymous owner, potentially able to manipulate the contract.';
            }
            if (tokenInfo.isHoneypot !== '0' && tokenInfo.isHoneypot !== undefined) {
              tokenInfo.isHoneypot +=
                ' - If a token is Honeypot, very high chance it is a scam. Buyers may not be able to sell this token, or the token contains malicious code.';
            }
            if (tokenInfo.isMintable !== '0' && tokenInfo.isMintable !== undefined) {
              tokenInfo.isMintable +=
                ' - Owner can mint additional tokens, increasing the total supply.';
            }
            if (tokenInfo.sellTax !== '0' && tokenInfo.sellTax !== undefined) {
              tokenInfo.sellTax +=
                ' - Transfer fee will cause the actual value received when transferring a token to be less than expected, and high transfer fee may lead to large losses.';
            }
            if (tokenInfo.fakeToken !== null && tokenInfo.fakeToken !== undefined) {
              tokenInfo.fakeToken +=
                ' - This token is either a scam or imitation of another token.';
            }
            if (tokenInfo.freezeable !== null && tokenInfo.freezeable !== undefined) {
              tokenInfo.freezeable +=
                ' - Token SPL V2 element - the authority can freeze every token from transferring among wallets.';
            }
            if (tokenInfo.freezeAuthority !== null && tokenInfo.freezeAuthority !== undefined) {
              tokenInfo.freezeAuthority +=
                ' - Freeze Authority is who can freeze every token from transferring among wallets.';
            }
            if (tokenInfo.transferFeeEnable !== null && tokenInfo.transferFeeEnable !== undefined) {
              tokenInfo.transferFeeEnable +=
                ' -The authority can charge a percentage fee when this token is transferred among wallets.';
            }
          }
          logger.info(`✅ Returning token info for ${tokenInfo.symbol || query}`);
          return JSON.stringify({
            status: 'success',
            data: tokenInfo,
            provider: preferredProvider || 'auto',
            network,
          });
        } catch (error: any) {
          logger.error('❌ Token info error:', error);

          // Use BaseTool's error handling
          return this.handleError(error, args);
        }
      },
    };
  }
}
