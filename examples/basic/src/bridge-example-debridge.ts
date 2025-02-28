import { ethers } from 'ethers';
import {
  Agent,
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
} from '@binkai/core';
import { BridgePlugin } from '@binkai/bridge-plugin';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { TokenPlugin } from '@binkai/token-plugin';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

async function main() {
  console.log('🚀 Starting BinkOS bridge example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 OpenAI API key found\n');

  // Define available networks
  console.log('📡 Configuring networks...');
  const networks: NetworksConfig['networks'] = {
    [NetworkName.SOLANA]: {
      type: 'solana' as NetworkType,
      config: {
        rpcUrl: SOL_RPC,
        name: 'Solana',
        nativeCurrency: {
          name: 'Solana',
          symbol: 'SOL',
          decimals: 9,
        },
      },
    },
    [NetworkName.BNB]: {
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
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n', network);

  // Initialize provider
  console.log('🔌 Initializing provider...');
  const provider = new ethers.JsonRpcProvider(BNB_RPC);
  //const provider =  new anchor.web3.Connection(SOL_RPC);
  console.log('✓ Provider initialized\n');

  // Initialize a new wallet
  console.log('👛 Creating wallet...');
  const wallet = new Wallet(
    {
      seedPhrase: settings.get('WALLET_MNEMONIC') || '',
      index: 8,
    },
    network,
  );

  console.log('🤖 Wallet SOL:', await wallet.getAddress(NetworkName.SOLANA));
  console.log('🤖 Wallet EVM:', await wallet.getAddress(NetworkName.BNB));

  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new Agent(
    {
      model: 'gpt-4o',
      temperature: 0,
      systemPrompt:
        'You are a BINK AI agent. You are able to perform bridge and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a bridge.',
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  // Create and configure the Bridge plugin
  console.log('🔄 Initializing bridge plugin...');
  const bridgePlugin = new BridgePlugin();

  console.log('🔍 Initializing token plugin...');
  const tokenPlugin = new TokenPlugin();

  // Create Birdeye provider with API key
  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });

  // Configure the plugin with supported chains
  await tokenPlugin.initialize({
    defaultChain: 'bnb',
    providers: [birdeye],
    supportedChains: ['solana', 'bnb'],
  });
  console.log('✓ Token plugin initialized\n');

  // Create providers with proper chain IDs
  const debridge = new deBridgeProvider(provider, 56, 7565164);

  // Configure the plugin with supported chains
  await bridgePlugin.initialize({
    defaultChain: 'bnb',
    providers: [debridge],
    supportedChains: ['bnb', 'solana'], // These will be intersected with agent's networks
  });

  console.log('✓ Bridge plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering bridge plugin with agent...');
  await agent.registerPlugin(bridgePlugin);
  console.log('✓ Plugin registered\n');

  console.log('🔌 Registering token plugin with agent...');
  await agent.registerPlugin(tokenPlugin);
  console.log('✓ Plugin registered\n');

  console.log('💱 Example 1:Bridge BNB to SOL on DeBridge Finance');
  const inputResult = await agent.execute({
    //input: `Bridge 10 USDC from SOL to BNB`,
    //input: `Bridge 0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d on BNB to amount 5 Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB on solana`, // usdc bnb to usdt sol
    input: `Bridge 0.00233344223232434 SOL to BNB`, // bridge and swap
    //input: `Bridge 5 USDC on SOL to 0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d on solana`,
  });
  console.log('✓ Bridge result (input):', inputResult, '\n');

  // Get plugin information
  const registeredPlugin = agent.getPlugin('bridge') as BridgePlugin;

  // Check available providers for each chain
  // console.log('📊 Available providers by chain:');
  const supportedNetworks = registeredPlugin.getSupportedNetworks();
  for (const itemnetwork of supportedNetworks) {
    const providers = registeredPlugin.getProvidersForNetwork(itemnetwork);
    console.log(`Network ${network}:`, providers.map(p => p.getName()).join(', '));
  }
  console.log('✓ Available providers:', supportedNetworks.join(', '));
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
