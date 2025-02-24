import axios from 'axios';
import { ITokenProvider, TokenInfo, TokenQueryParams } from '@binkai/token-plugin';
import {
  BirdeyeConfig,
  BirdeyeTokenResponse,
  TokenOverviewResponse,
  CHAIN_MAPPING,
  SupportedChain,
} from './types';
import { IWalletProvider, WalletInfo } from '@binkai/wallet-plugin';

export class BirdeyeProvider implements ITokenProvider, IWalletProvider {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(config: BirdeyeConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://public-api.birdeye.so';
    this.apiKey = config.apiKey;
  }

  getName(): string {
    return 'birdeye';
  }

  getSupportedChains(): string[] {
    return Object.keys(CHAIN_MAPPING);
  }

  private mapChain(chain: string): string {
    const mappedChain = CHAIN_MAPPING[chain as SupportedChain];
    if (!mappedChain) {
      throw new Error(`Chain ${chain} is not supported by Birdeye`);
    }
    return mappedChain;
  }

  private getHeaders(chain: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-chain': this.mapChain(chain),
    };

    if (this.apiKey) {
      headers['X-API-KEY'] = this.apiKey;
    }

    return headers;
  }

  private async searchTokensFromApi(query: string, chain: string): Promise<BirdeyeTokenResponse> {
    const response = await axios.get(`${this.baseUrl}/defi/v3/search`, {
      headers: this.getHeaders(chain),
      params: {
        keyword: query,
        sort_by: 'volume_24h_usd',
        sort_type: 'desc',
        limit: 10,
      },
    });

    return response.data;
  }

  private async getTokenOverview(address: string, chain: string): Promise<TokenOverviewResponse> {
    const response = await axios.get(`${this.baseUrl}/defi/token_overview`, {
      headers: this.getHeaders(chain),
      params: {
        address: address,
      },
    });

    return response.data;
  }

  private mapTokenInfo(
    tokenData: BirdeyeTokenResponse['data']['items'][0]['result'][0],
  ): TokenInfo {
    return {
      address: tokenData.address,
      symbol: tokenData.symbol,
      name: tokenData.name,
      decimals: tokenData.decimals || 0,
      price: {
        usd: tokenData.price,
      },
      marketCap: tokenData.market_cap || undefined,
      volume24h: tokenData.volume_24h_usd,
      priceChange24h: tokenData.price_change_24h_percent,
      logoURI: tokenData.logo_uri,
    };
  }

  private mapTokenOverviewToInfo(data: TokenOverviewResponse['data']): TokenInfo {
    return {
      address: data.address,
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      price: {
        usd: data.price,
      },
      marketCap: data.market_cap,
      volume24h: data.volume_24h_usd,
      priceChange24h: data.priceChange24hPercent,
      logoURI: data.logoURI,
      verified: true, // Token overview endpoint returns verified tokens
    };
  }

  private isAddress(query: string): boolean {
    // Basic address validation - can be enhanced based on chain requirements
    return /^[0-9a-zA-Z]{32,44}$/.test(query);
  }

  async getTokenInfo(params: TokenQueryParams): Promise<TokenInfo> {
    if (!params.chain) {
      throw new Error('Chain parameter is required for Birdeye provider');
    }

    try {
      if (this.isAddress(params.query)) {
        // If query is an address, use token_overview endpoint
        const response = await this.getTokenOverview(params.query, params.chain);
        if (!response.success) {
          throw new Error(`Token ${params.query} not found on chain ${params.chain}`);
        }
        return this.mapTokenOverviewToInfo(response.data);
      } else {
        // If query is a symbol, use search endpoint
        const response = await this.searchTokensFromApi(params.query, params.chain);
        if (!response.success || !response.data.items?.[0]?.result?.[0]) {
          throw new Error(`Token ${params.query} not found on chain ${params.chain}`);
        }
        return this.mapTokenInfo(response.data.items[0].result[0]);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Birdeye API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  async searchTokens(query: string, chain: string): Promise<TokenInfo[]> {
    try {
      const response = await this.searchTokensFromApi(query, chain);
      if (!response.success || !response.data.items?.[0]?.result) {
        return [];
      }
      return response.data.items[0].result.map(tokenData => this.mapTokenInfo(tokenData));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Birdeye API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  async isValidAddress(address: string, chain: string): Promise<boolean> {
    if (!this.isAddress(address)) {
      return false;
    }

    try {
      const response = await this.getTokenOverview(address, chain);
      return response.success;
    } catch {
      return false;
    }
  }

  async getWalletInfo(address: string, chain: string): Promise<WalletInfo> {
    try {
      const response = await axios.get(`${this.baseUrl}/v1/wallet/token_list`, {
        headers: this.getHeaders(chain),
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
          address: token.address,
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
