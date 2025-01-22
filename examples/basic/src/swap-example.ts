import { ethers } from 'ethers';
import { Agent, Wallet, Network, settings, NetworkType, NetworksConfig } from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { ChainId } from '@pancakeswap/sdk';

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';

async function main() {
  console.log('🚀 Starting BinkOS swap example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 OpenAI API key found\n');

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
    ethereum: {
      type: 'evm' as NetworkType,
      config: {
        chainId: 1,
        rpcUrl: ETH_RPC,
        name: 'Ethereum',
        nativeCurrency: {
          name: 'Ether',
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

  // Initialize provider
  console.log('🔌 Initializing provider...');
  const provider = new ethers.JsonRpcProvider(BNB_RPC);
  console.log('✓ Provider initialized\n');

  // Initialize a new wallet
  console.log('👛 Creating wallet...');
  const wallet = new Wallet({
    seedPhrase: settings.get('WALLET_MNEMONIC') || 'test test test test test test test test test test test junk',
    index: 0
  }, network);
  console.log('✓ Wallet created\n');

  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new Agent({
    model: 'gpt-4o',
    temperature: 0,
  }, wallet, networks);
  console.log('✓ Agent initialized\n');

  // Create and configure the swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();
  
  // Create providers with proper chain IDs
  const pancakeswap = new PancakeSwapProvider(provider, ChainId.BSC);

  // Configure the plugin with supported chains
  await swapPlugin.initialize({
    defaultSlippage: 0.5,
    defaultChain: 'bnb',
    providers: [pancakeswap],
    supportedChains: ['bnb', 'ethereum'], // These will be intersected with agent's networks
  });
  console.log('✓ Swap plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering swap plugin with agent...');
  await agent.registerPlugin(swapPlugin);
  console.log('✓ Plugin registered\n');

  // Example 1: Swap exact 1 USDT for BNB on BNB Chain
  console.log('💱 Example 1: Swap with exact input amount on BNB Chain');
  const inputResult = await agent.execute({
    input: `
      Swap exactly 1 BINK for BNB on PancakeSwap with 0.5% slippage on bnb chain.
      Use the following token addresses:
      BINK: 0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1
      BNB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
    `
  });
  console.log('✓ Swap result (input):', inputResult, '\n');

  // Example 2: Swap USDT for exact 0.1 BNB on BNB Chain
  console.log('💱 Example 2: Swap with exact output amount on BNB Chain');
  const outputResult = await agent.execute({
    input: `
      Swap BINK for exactly 0.001 BNB on PancakeSwap with 0.5% slippage on bnb chain.
      Use the following token addresses:
      BINK: 0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1
      BNB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
    `
  });
  console.log('✓ Swap result (output):', outputResult, '\n');

  // Get plugin information
  const registeredPlugin = agent.getPlugin('swap') as SwapPlugin;
  
  // Check available providers for each chain
  console.log('📊 Available providers by chain:');
  const chains = registeredPlugin.getSupportedChains();
  for (const chain of chains) {
    const providers = registeredPlugin.getProvidersForChain(chain);
    console.log(`Chain ${chain}:`, providers.map(p => p.getName()).join(', '));
  }
  console.log();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
}); 