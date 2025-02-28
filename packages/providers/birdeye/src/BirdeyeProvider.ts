import axios from 'axios';
import { ITokenProvider, TokenInfo, TokenQueryParams } from '@binkai/token-plugin';
import {
  BirdeyeConfig,
  BirdeyeTokenResponse,
  TokenOverviewResponse,
  CHAIN_MAPPING,
  SupportedChain,
} from './types';
import { NetworkName } from '@binkai/core';
import { IWalletProvider, WalletInfo } from '@binkai/wallet-plugin';

export class BirdeyeProvider implements ITokenProvider, IWalletProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly supportedNetworks: NetworkName[];

  constructor(config: BirdeyeConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://public-api.birdeye.so';
    this.apiKey = config.apiKey;
    this.supportedNetworks = Object.keys(CHAIN_MAPPING) as NetworkName[];
  }

  getName(): string {
    return 'birdeye';
  }

  getSupportedNetworks(): NetworkName[] {
    return this.supportedNetworks;
  }

  private isNetworkSupported(network: NetworkName): boolean {
    return this.supportedNetworks.includes(network);
  }

  private mapChain(network: NetworkName): string {
    const mappedChain = CHAIN_MAPPING[network as SupportedChain];
    if (!mappedChain) {
      throw new Error(`Network ${network} is not supported by Birdeye`);
    }
    return mappedChain;
  }

  private getHeaders(network: NetworkName): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-chain': this.mapChain(network),
    };

    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    return headers;
  }

  private async searchTokensFromApi(
    query: string,
    network: NetworkName,
  ): Promise<BirdeyeTokenResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/defi/v3/search`, {
        headers: this.getHeaders(network),
        params: {
          keyword: query,
          sort_by: 'liquidity',
          sort_type: 'desc',
          limit: 10,
          chain: this.mapChain(network),
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Birdeye API search error: ${error.response?.data?.message || error.message}`,
        );
      }
      throw error;
    }
  }

  private async getTokenOverview(
    address: string,
    network: NetworkName,
  ): Promise<TokenOverviewResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/defi/token_overview`, {
        headers: this.getHeaders(network),
        params: {
          address: address,
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Birdeye API token overview error: ${error.response?.data?.message || error.message}`,
        );
      }
      throw error;
    }
  }

  private mapTokenInfo(
    tokenData: BirdeyeTokenResponse['data']['items'][0]['result'][0],
    network: NetworkName,
  ): TokenInfo {
    return {
      address: tokenData.address,
      symbol: tokenData.symbol,
      name: tokenData.name,
      decimals: tokenData.decimals || 0,
      network,
      price: {
        usd: tokenData.price,
      },
      marketCap: tokenData.market_cap || undefined,
      volume24h: tokenData.volume_24h_usd,
      priceChange24h: tokenData.price_change_24h_percent,
      logoURI: tokenData.logo_uri,
      verified: true, // Assuming tokens from Birdeye are verified
    };
  }

  private mapTokenOverviewToInfo(
    data: TokenOverviewResponse['data'],
    network: NetworkName,
  ): TokenInfo {
    return {
      address: data.address,
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      network,
      price: {
        usd: data.price,
      },
      marketCap: data.marketCap ?? data.mc,
      volume24h: data.v24hUSD,
      priceChange24h: data.priceChange24hPercent,
      logoURI: data.logoURI,
      verified: true, // Token overview endpoint returns verified tokens
    };
  }

  private isAddress(query: string): boolean {
    // Basic address validation - can be enhanced based on network requirements
    return /^[0-9a-zA-Z]{32,44}$/.test(query);
  }

  async getTokenInfo(params: TokenQueryParams): Promise<TokenInfo> {
    const { query, network } = params;

    if (!network) {
      throw new Error('Network parameter is required for Birdeye provider');
    }

    if (!this.isNetworkSupported(network)) {
      throw new Error(
        `Network ${network} is not supported by Birdeye. Supported networks: ${this.supportedNetworks.join(', ')}`,
      );
    }

    try {
      if (this.isAddress(query)) {
        // If query is an address, use token_overview endpoint
        const response = await this.getTokenOverview(query, network);
        if (!response.success) {
          throw new Error(`Token ${query} not found on network ${network}`);
        }
        return this.mapTokenOverviewToInfo(response.data, network);
      } else {
        // If query is a symbol, use search endpoint
        const response = await this.searchTokensFromApi(query, network);
        if (!response.success || !response.data.items?.[0]?.result?.[0]) {
          throw new Error(`Token ${query} not found on network ${network}`);
        }
        return this.mapTokenInfo(response.data.items[0].result[0], network);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Birdeye API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  async searchTokens(query: string, network: NetworkName): Promise<TokenInfo[]> {
    if (!this.isNetworkSupported(network)) {
      throw new Error(
        `Network ${network} is not supported by Birdeye. Supported networks: ${this.supportedNetworks.join(', ')}`,
      );
    }

    try {
      const response = await this.searchTokensFromApi(query, network);
      if (!response.success || !response.data.items?.[0]?.result) {
        return [];
      }
      return response.data.items[0].result.map(tokenData => this.mapTokenInfo(tokenData, network));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Birdeye API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  async isValidAddress(address: string, network: NetworkName): Promise<boolean> {
    if (!this.isNetworkSupported(network)) {
      return false;
    }

    if (!this.isAddress(address)) {
      return false;
    }

    try {
      const response = await this.getTokenOverview(address, network);
      return response.success;
    } catch {
      return false;
    }
  }

  async getWalletInfo(address: string, network: NetworkName): Promise<WalletInfo> {
    try {
      const response = await axios.get(`${this.baseUrl}/v1/wallet/token_list`, {
        headers: this.getHeaders(network),
        params: { wallet: address },
      });
      if (!response.data.success || !response.data.data.items) {
        return {
          address: address,
          nativeBalance: undefined,
          tokens: undefined,
        };
      }
      return {
        address: address,
        nativeBalance: undefined,
        tokens: response.data.data.items.map((token: any) => ({
          tokenAddress: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          usdValue: token.priceUsd * token.uiAmount,
          balance: token.uiAmount,
        })),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Birdeye API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}
