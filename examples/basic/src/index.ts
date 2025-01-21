import { Agent, Wallet, Network, settings, NetworkType, NetworksConfig } from '@binkai/core';

async function main() {
  console.log('🚀 Starting BinkOS basic example...\n');

  // Define available networks
  console.log('📡 Configuring networks...');
  const networks: NetworksConfig['networks'] = {
    'solana:devnet': {
      type: 'solana' as NetworkType,
      config: {
        rpcUrl: 'https://api.devnet.solana.com',
        name: 'Solana Devnet',
        blockExplorerUrl: 'https://explorer.solana.com/?cluster=devnet'
      }
    }
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

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
    model: 'gpt-4',
    temperature: 1,
  }, wallet, networks);
  console.log('✓ Agent initialized\n');

  // Example interaction with the agent
  console.log('💬 Sending query to agent: "What is my wallet\'s address?"\n');
  const response = await agent.execute({
    network: 'solana:devnet',
    input: "What is my wallet's address?"
  });

  console.log('🤖 Agent Response:', response, '\n');

  // Get and display the actual wallet address for verification
  const address = await wallet.getAddress('solana:devnet');
  console.log('✓ Verified wallet address:', address);
}

// Check if OPENAI_API_KEY is set
if (!settings.has('OPENAI_API_KEY')) {
  console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
  process.exit(1);
}

console.log('🔑 OpenAI API key found\n');

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
}); 