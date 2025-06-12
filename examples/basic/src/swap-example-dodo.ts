import { ethers } from 'ethers';
import {
  Agent,
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
  logger,
  OpenAIModel,
} from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { DodoProvider, ChainId } from '@binkai/dodo-provider';

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const BASE_RPC = 'https://mainnet.base.org';

async function main() {
  console.log('🚀 Starting BinkOS Dodo swap example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  if (!settings.has('DODO_API_KEY')) {
    console.error('❌ Error: Please set DODO_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 OpenAI API key found');
  console.log('🔑 Dodo API key found\n');

  //configure enable logger
  logger.enable();

  // Define available networks
  console.log('📡 Configuring networks...');
  const networks: NetworksConfig['networks'] = {
    bnb: {
      type: 'evm' as NetworkType,
      config: {
        chainId: 56,
        rpcUrl: BNB_RPC,
        name: 'BNB Chain',
        nativeCurrency: {
          name: 'BNB',
          symbol: 'BNB',
          decimals: 18,
        },
      },
    },
    base: {
      type: 'evm' as NetworkType,
      config: {
        chainId: 8453,
        rpcUrl: BASE_RPC,
        name: 'Base',
        nativeCurrency: {
          name: 'ETH',
          symbol: 'ETH',
          decimals: 18,
        },
      },
    },
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

  // Initialize providers
  console.log('🔌 Initializing providers...');
  const bnbProvider = new ethers.JsonRpcProvider(BNB_RPC);
  const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);
  console.log('✓ Providers initialized\n');

  // Initialize a new wallet
  console.log('👛 Creating wallet...');
  const wallet = new Wallet(
    {
      seedPhrase:
        settings.get('WALLET_MNEMONIC') ||
        'test test test test test test test test test test test test',
      index: 0,
    },
    network,
  );

  console.log('✓ Wallet created\n');
  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));
  console.log('🤖 Wallet Base:', await wallet.getAddress(NetworkName.BASE));

  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const llm = new OpenAIModel({
    apiKey: settings.get('OPENAI_API_KEY') || '',
    model: 'gpt-4o-mini',
  });

  const agent = new Agent(
    llm,
    {
      temperature: 0,
      systemPrompt:
        'You are a BINK AI agent. You are able to perform swaps and get token information on BNB Chain and Base using Dodo DEX. If you do not have the token address, you can use the symbol to get the token information before performing a swap.',
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  // Create and configure the swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();

  // Create providers with proper chain IDs and API key
  const dodoBnb = new DodoProvider({
    provider: bnbProvider,
    chainId: ChainId.BNB,
    apiKey: settings.get('DODO_API_KEY') || '',
  });

  const dodoBase = new DodoProvider({
    provider: baseProvider,
    chainId: ChainId.BASE,
    apiKey: settings.get('DODO_API_KEY') || '',
  });

  // Configure the plugin with supported chains
  await swapPlugin.initialize({
    defaultSlippage: 0.5,
    defaultChain: 'bnb',
    providers: [dodoBnb, dodoBase],
    supportedChains: ['bnb', 'base'],
  });
  console.log('✓ Swap plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering swap plugin with agent...');
  await agent.registerPlugin(swapPlugin);
  console.log('✓ Plugin registered\n');

  // Example 1: Swap BNB to BINK on BNB Chain
  console.log('💱 Example 1: Swap BNB to BINK on BNB Chain');
  const result1 = await agent.execute({
    input: `
      Sell 0.001 BNB to BINK on Dodo with 0.5% slippage on bnb chain.
      Use the following token addresses:
      BINK: 0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1
    `,
  });
  console.log('✓ Swap result:', result1, '\n');

  // Get plugin information
  const registeredPlugin = agent.getPlugin('swap') as SwapPlugin;

  // Check available providers for each chain
  console.log('📊 Available providers by chain:');
  const chains = registeredPlugin.getSupportedNetworks();
  for (const chain of chains) {
    const providers = registeredPlugin.getProvidersForNetwork(chain);
    console.log(`Chain ${chain}:`, providers.map(p => p.getName()).join(', '));
  }
  console.log();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
