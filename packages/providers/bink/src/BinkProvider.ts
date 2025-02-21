import axios from 'axios';
import {
  IKnowledgeProvider,
  KnowledgeQueryParams,
  KnowledgeResponse,
} from '@binkai/knowledge-plugin';

export interface BinkProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export class BinkProvider implements IKnowledgeProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: BinkProviderConfig) {
    if (!config.baseUrl) {
      throw new Error('BINK_API_URL are required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }

  getName(): string {
    return 'bink';
  }

  async query(params: KnowledgeQueryParams): Promise<KnowledgeResponse> {
    try {
      const response = await axios.post(`${this.baseUrl}`, params, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      return { sources: [{ content: response?.data?.data }] };
    } catch (error: any) {
      console.error('error', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Bink API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}
