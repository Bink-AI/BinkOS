import { z } from 'zod';
import {
  BaseTool,
  CustomDynamicStructuredTool,
  IToolConfig,
  ToolProgress,
  ErrorStep,
  StructuredError,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IStakingProvider, StakingBalance } from './types';

export interface StakingBalanceToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export class GetStakingBalanceTool extends BaseTool {
  public registry: ProviderRegistry;
  private supportedNetworks: Set<string>;

  constructor(config: StakingBalanceToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: IStakingProvider): void {
    this.registry.registerProvider(provider);
    console.log('🔌 Provider registered:', provider.getName());
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'get_staking_balance';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Get detailed information about staked tokens in a wallet across all supported networks, including token balances, APY, and rewards. Supports networks: ${networks}. Available providers: ${providers}. Use this tool when you need to check what tokens a user has staked, their balances, and detailed staking information.`;
  }

  private getSupportedNetworks(): string[] {
    const agentNetworks = Object.keys(this.agent.getNetworks());
    const providerNetworks = Array.from(this.supportedNetworks);
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  mockResponseTool(args: any): Promise<string> {
    let allStakingBalances: { address: string; tokens: StakingBalance[] }[] = [];
    const combinedTokens: StakingBalance[] = [];
    allStakingBalances.forEach(balanceData => {
      if (balanceData.tokens && balanceData.tokens.length > 0) {
        combinedTokens.push(...balanceData.tokens);
      }
    });
    
    return Promise.resolve(
      JSON.stringify({
        status: 'success',
        data: {
          address: args.address,
          token: combinedTokens,
        },
        network: args.network,
        address: args.address,
      }),
    );
  }

  getSchema(): z.ZodObject<any> {
    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      address: z
        .string()
        .optional()
        .describe('The wallet address to query (optional - uses agent wallet if not provided)'),
      network: z
        .enum(['bnb', 'solana', 'ethereum'])
        .default('bnb')
        .describe('The blockchain to query the staking balances on.'),
    });
  }

  createTool(): CustomDynamicStructuredTool {
    console.log('🛠️ Creating staking balance tool');
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
          if (this.agent.isMockResponseTool()) {
            return this.mockResponseTool(args);
          }

          const network = args.network;
          let address = args.address;
          console.log(`🔍 Getting staking balances for ${address || 'agent wallet'} on ${network}`);

          // STEP 1: Validate network
          const supportedNetworks = this.getSupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            console.error(`❌ Network ${network} is not supported`);
            throw this.createError(
              ErrorStep.NETWORK_VALIDATION,
              `Network ${network} is not supported.`,
              {
                requestedNetwork: network,
                supportedNetworks: supportedNetworks,
              },
            );
          }

          // STEP 2: Get wallet address
          try {
            // If no address provided, get it from the agent's wallet
            if (!address) {
              console.log('🔑 No address provided, using agent wallet');
              address = await this.agent.getWallet().getAddress(network);
              console.log(`🔑 Using agent wallet address: ${address}`);
            }
          } catch (error) {
            console.error(`❌ Failed to get wallet address for network ${network}`);
            throw error;
          }

          onProgress?.({
            progress: 20,
            message: `Retrieving staking information for ${address}`,
          });

          // STEP 3: Check providers
          const providers = this.registry.getProvidersByNetwork(network);
          if (providers.length === 0) {
            console.error(`❌ No providers available for network ${network}`);
            throw this.createError(
              ErrorStep.PROVIDER_AVAILABILITY,
              `No providers available for network ${network}.`,
              {
                network: network,
                availableProviders: this.registry.getProviderNames(),
                supportedNetworks: Array.from(this.supportedNetworks),
              },
            );
          }

          console.log(`🔄 Found ${providers.length} providers for network ${network}`);

          let allStakingBalances: { address: string; tokens: StakingBalance[] }[] = [];
          const errors: Record<string, string> = {};

          // STEP 4: Query providers
          // Try all providers and collect results
          for (const provider of providers) {
            console.log(`🔄 Querying provider: ${provider.getName()}`);
            try {
              const stakingBalances = await provider.getAllStakingBalances(address);
              console.log(`✅ Successfully got staking data from ${provider.getName()}`);
              allStakingBalances.push(stakingBalances);
            } catch (error) {
              console.warn(
                `⚠️ Failed to get staking info from ${provider.getName()}: ${error instanceof Error ? error.message : error}`,
              );
              this.logError(
                `Failed to get staking info from ${provider.getName()}: ${error}`,
                'warn',
              );
              errors[provider.getName()] = error instanceof Error ? error.message : String(error);
            }
          }

          // Combine all staking balances
          const combinedTokens: StakingBalance[] = [];
          allStakingBalances.forEach(balanceData => {
            if (balanceData.tokens && balanceData.tokens.length > 0) {
              combinedTokens.push(...balanceData.tokens);
            }
          });

          // If no successful results, throw error
          if (combinedTokens.length === 0) {
            console.error(`❌ No staking balances found for ${address} or all providers failed`);

            // If we have errors, return them
            if (Object.keys(errors).length > 0) {
              return JSON.stringify({
                status: 'error',
                message: `No staking balances found for ${address}`,
                errors,
                network,
                address,
              });
            }

            // Otherwise return empty result
            return JSON.stringify({
              status: 'success',
              data: { address, tokens: [] },
              message: `No staking balances found for ${address}`,
              network,
              address,
            });
          }

          console.log(`💰 Staking info retrieved successfully for ${address}`);

          if (Object.keys(errors).length > 0) {
            console.warn(`⚠️ Some providers failed but we have partial results`);
          }

          onProgress?.({
            progress: 100,
            message: `Successfully retrieved staking information for ${address}`,
          });

          console.log(`✅ Returning staking balance data for ${address}`);

          return JSON.stringify({
            status: 'success',
            data: { address, tokens: combinedTokens },
            errors: Object.keys(errors).length > 0 ? errors : undefined,
            network,
            address,
          });
        } catch (error) {
          console.error(
            '❌ Error in staking balance tool:',
            error instanceof Error ? error.message : error,
          );
          return this.handleError(error, args);
        }
      },
    };
  }
}
