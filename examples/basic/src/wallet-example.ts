import { WalletPlugin } from '@binkai/wallet-plugin';
import { BnbProvider } from '@binkai/bnb-provider';
import { Agent, NetworkType, Network, NetworksConfig, settings, Wallet } from '@binkai/core';

async function main() {
  const BNB_RPC = 'https://bsc-dataseed1.binance.org';

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
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

  // Initialize a new wallet
  console.log('👛 Creating wallet...');
  const wallet = new Wallet(
    {
      seedPhrase:
        settings.get('WALLET_MNEMONIC') ||
        'test test test test test test test test test test test junk',
      index: 0,
    },
    network,
  );
  console.log('✓ Wallet created\n');

  console.log('🤖 Wallet BNB:', await wallet.getAddress('bnb'));

  // Create and configure the wallet plugin
  const walletPlugin = new WalletPlugin();
  // Create provider with API key
  const bnbProvider = new BnbProvider({
    rpcUrl: BNB_RPC,
  });
  // Initialize plugin with provider
  await walletPlugin.initialize({
    defaultChain: 'bnb',
    providers: [bnbProvider],
    supportedChains: ['bnb'],
  });

  // Create agent instance
  const agent = new Agent(
    {
      model: 'gpt-4o-mini',
      temperature: 0,
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');
  // Register with agent
  await agent.registerPlugin(walletPlugin);

  // Use the plugin through the agent
  const result = await agent.execute({
    input: 'Get my wallet balance on bnb',
  });
  console.log('Query result:', result);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
