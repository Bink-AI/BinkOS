import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig, NetworkName } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IWalletProvider, TransferParams } from './types';
import { ethers } from 'ethers';

export function validateTokenAddress(address: string): boolean {
  try {
    // Check if it's a valid Ethereum address
    return ethers.isAddress(address);
  } catch (error) {
    return false;
  }
}

export interface TransferToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export class TransferTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: TransferToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultNetwork = config.defaultNetwork || 'bnb';
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: IWalletProvider): void {
    this.registry.registerProvider(provider);

    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'transfer_tokens';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Transfer tokens from your wallet to another address. Supports networks: ${networks}. Available providers: ${providers}.`;
  }

  private getSupportedNetworks(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported networks from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported networks
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No wallet providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      token: z.string().describe('The token address to transfer'),
      toAddress: z.string().describe('The recipient address'),
      amount: z.string().describe('The amount of tokens to transfer'),
      network: z
        .enum(supportedNetworks as [string, ...string[]])
        .default(this.defaultNetwork)
        .describe('The blockchain network to execute the transfer on'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .default('bnb')
        .describe(
          'The provider to use for the transfer. If not specified, the standard provider will be used',
        ),
    });
  }

  createTool(): DynamicStructuredTool {
    console.log('✓ Creating tool', this.getName());
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args: any) => {
        try {
          const {
            token,
            toAddress,
            amount,
            network = this.defaultNetwork,
            provider: preferredProvider,
          } = args;

          console.log('🤖 Transfer Args:', args);

          // Validate token address
          if (!validateTokenAddress(token)) {
            throw new Error(`Invalid token address for network ${network}: ${token}`);
          }

          // Get agent's wallet and address
          const wallet = this.agent.getWallet();
          const userAddress = await wallet.getAddress(network);

          // Validate network is supported
          const supportedNetworks = this.getSupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            throw new Error(
              `Network ${network} is not supported. Supported networks: ${supportedNetworks.join(', ')}`,
            );
          }
          const transferParams: TransferParams = {
            network: network as NetworkName,
            token,
            toAddress,
            amount,
          };
          // Get the provider
          const selectedProvider = this.registry.getProvider(preferredProvider);
          // Validate provider supports the network
          if (!selectedProvider.getSupportedNetworks().includes(network as NetworkName)) {
            throw new Error(`Provider ${preferredProvider} does not support network ${network}`);
          }

          // Get quote
          const quote = await selectedProvider?.getQuote?.(transferParams, userAddress);
          if (!quote) {
            throw new Error('No quote found');
          }

          // Check balance
          const balanceCheck = await selectedProvider?.checkBalance?.(quote, userAddress);
          if (!balanceCheck?.isValid) {
            throw new Error(`Insufficient balance: ${balanceCheck?.message}`);
          }

          // Build transaction
          const transferTx = await selectedProvider?.buildTransferTransaction?.(quote, userAddress);
          if (!transferTx) {
            throw new Error('No transfer transaction found');
          }

          const allowance = await selectedProvider?.checkAllowance?.(
            network as NetworkName,
            token,
            userAddress,
            transferTx?.to,
          );

          const requiredAmount = BigInt(
            Number(quote?.amount || 0) * 10 ** (quote?.token.decimals || 0),
          );

          console.log('🤖 Allowance: ', allowance, ' Required amount: ', requiredAmount);

          if (allowance && allowance < requiredAmount) {
            const approveTx = await selectedProvider?.buildApproveTransaction?.(
              network as NetworkName,
              token,
              transferTx?.to,
              quote?.amount,
              userAddress,
            );

            console.log('🤖 Approving...');
            // Sign and send approval transaction
            const approveReceipt = await wallet.signAndSendTransaction(network, {
              to: approveTx?.to || '',
              data: approveTx?.data || '',
              value: BigInt(approveTx?.value || 0),
            });

            console.log('🤖 ApproveReceipt:', approveReceipt);

            // Wait for approval to be mined
            await approveReceipt.wait();
          }

          console.log('🤖 Transferring...');

          // Sign and send transfer transaction
          const receipt = await wallet.signAndSendTransaction(network, {
            to: transferTx.to,
            data: transferTx.data,
            value: BigInt(transferTx.value),
          });

          // Wait for transaction to be mined
          const finalReceipt = await receipt.wait();

          // Return result as JSON string
          return JSON.stringify({
            provider: selectedProvider.getName(),
            token: quote.token,
            fromAddress: userAddress,
            toAddress: quote.toAddress,
            amount: quote.amount,
            transactionHash: finalReceipt.hash,
            network,
          });
        } catch (error) {
          console.error('Transfer error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
  }
}
