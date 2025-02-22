import { Agent, Wallet, Network, settings, NetworkType, NetworksConfig } from '@binkai/core';
import { KnowledgePlugin } from '@binkai/knowledge-plugin';
import { BinkProvider } from '@binkai/bink-provider';
import { PostgresDatabaseAdapter } from '@binkai/postgres-adapter';

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

  // Create agent instance
  const agent = new Agent(
    {
      model: 'gpt-4o-mini',
      temperature: 0,
    },
    wallet,
    networks,
  );
  await agent.initialize();
  console.log('✓ Agent initialized\n');

  // Initialize database
  console.log('🗄️ Initializing database...');
  let db: PostgresDatabaseAdapter | undefined;
  if (settings.get('POSTGRES_URL')) {
    db = new PostgresDatabaseAdapter({
      connectionString: settings.get('POSTGRES_URL'),
    });
    await agent.registerDatabase(db);
  }

  // Create Bink provider with API key
  const binkProvider = new BinkProvider({
    apiKey: settings.get('BINK_API_KEY') || '',
    baseUrl: settings.get('BINK_API_URL') || '',
  });
  // Initialize plugin with provider
  const knowledgePlugin = new KnowledgePlugin();
  await knowledgePlugin.initialize({
    providers: [binkProvider],
  });

  // Register with agent
  await agent.registerPlugin(knowledgePlugin);

  // // Example query
  // const result = await agent.execute({
  //   input: 'What is the purpose of the BinkAI project?',
  // });

  // console.log('Query result:', result);

  // const result2 = await agent.execute({
  //   input: 'What did elon musk say?',
  // });

  // console.log('Query result:', result2);

  // // TEST delete threadId
  // await db?.clearThreadMessages('5083596c-a0d1-4588-8a4f-dddc7ae2137e');

  const result3 = await agent.execute({
    input: 'compare 9.11 vs 9.9',
    threadId: '5083596c-a0d1-4588-8a4f-dddc7ae2137e',
  });
  console.log('Query result:', result3);

  // Test clear user messages
  // await agent.clearUserMessages(await wallet.getAddress('bnb'));

  const result4 = await agent.execute({
    input: 'compare 10.11 vs 10.9',
    threadId: '5083596c-a0d1-4588-8a4f-dddc7ae2137e',
  });

  console.log('Query result:', result4);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
