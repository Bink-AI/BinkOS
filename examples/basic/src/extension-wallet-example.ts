import { ethers, Transaction, TransactionRequest } from 'ethers';
import {
  Agent,
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
  IToolExecutionCallback,
  ToolExecutionData,
  ToolExecutionState,
  ExtensionWallet,
  OpenAIModel,
} from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
// import { OkxProvider } from '@binkai/okx-provider';
import { TokenPlugin } from '@binkai/token-plugin';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { WalletPlugin } from '@binkai/wallet-plugin';
import { BnbProvider } from '@binkai/rpc-provider';
// import { FourMemeProvider } from '@binkai/four-meme-provider';
import { BridgePlugin } from '@binkai/bridge-plugin';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { AlchemyProvider } from '@binkai/alchemy-provider';
import {
  Connection,
  VersionedTransaction,
  Transaction as SolanaTransaction,
} from '@solana/web3.js';

const io = new Server(3000, {
  // options
});

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

// Example callback implementation
class ExampleToolExecutionCallback implements IToolExecutionCallback {
  onToolExecution(data: ToolExecutionData): void {
    const stateEmoji = {
      [ToolExecutionState.STARTED]: '🚀',
      [ToolExecutionState.IN_PROCESS]: '⏳',
      [ToolExecutionState.COMPLETED]: '✅',
      [ToolExecutionState.FAILED]: '❌',
    };

    const emoji = stateEmoji[data.state] || '🔄';

    console.log(`${emoji} [${new Date(data.timestamp).toISOString()}] ${data.message}`);

    if (data.state === ToolExecutionState.IN_PROCESS && data.data) {
      console.log(`   Progress: ${data.data.progress || 0}%`);
    }

    if (data.state === ToolExecutionState.COMPLETED && data.data) {
      console.log(
        `   Result: ${JSON.stringify(data.data).substring(0, 100)}${JSON.stringify(data.data).length > 100 ? '...' : ''}`,
      );
    }

    if (data.state === ToolExecutionState.FAILED && data.error) {
      console.log(`   Error: ${data.error.message || String(data.error)}`);
    }
  }
}

async function mockExtensionWalletClient(network: Network) {
  //Fake wallet for testing
  const wallet = new Wallet(
    {
      seedPhrase:
        settings.get('WALLET_MNEMONIC') ||
        'test test test test test test test test test test test junk',
      index: 0,
    },
    network,
  );
  const socket = ioClient('http://localhost:3000');

  socket.on('connect', () => {
    console.log('connected to extension wallet client');
  });

  socket.on('disconnect', () => {
    console.log('disconnected from extension wallet client');
  });

  socket.on('error', error => {
    console.log('error from extension wallet client', error);
  });

  socket.on('get_address', async (data, callback) => {
    console.log('get_address from extension wallet client', data);
    callback({ address: await wallet.getAddress(data.network) });
  });

  socket.on('sign_message', async (data, callback) => {
    console.log('sign_message from extension wallet client', data);
    callback({ signature: await wallet.signMessage(data) });
  });

  socket.on('sign_transaction', async (data, callback) => {
    console.log('sign_transaction from extension wallet client', data);
    let tx: ethers.Transaction | VersionedTransaction | SolanaTransaction;

    if (data.network == 'solana') {
      try {
        tx = VersionedTransaction.deserialize(Buffer.from(data.transaction, 'base64'));
      } catch (e) {
        tx = SolanaTransaction.from(Buffer.from(data.transaction, 'base64'));
      }
    } else {
      tx = Transaction.from(data.transaction);
    }

    const signedTx = await wallet.signTransaction({ network: data.network, transaction: tx });
    console.log('signedTx', signedTx);
    callback({ signedTransaction: signedTx });
  });
}

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
    [NetworkName.ETHEREUM]: {
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
  const wallet = new ExtensionWallet(network);
  console.log('✓ Wallet created\n');

  //Listen for connection from extension wallet
  io.on('connection', socket => {
    console.log('a user connected');
    wallet.connect(socket);
  });

  await mockExtensionWalletClient(network);

  //sleep for 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));
  console.log('🤖 Wallet ETH:', await wallet.getAddress(NetworkName.SOLANA));
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
        'You are a BINK AI agent. You are able to perform bridge and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a bridge.',
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  // Register the tool execution callback
  console.log('🔔 Registering tool execution callback...');
  agent.registerToolExecutionCallback(new ExampleToolExecutionCallback());
  console.log('✓ Callback registered\n');

  // Create and configure the swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();

  console.log('🔄 Initializing bridge plugin...');
  const bridgePlugin = new BridgePlugin();

  console.log('🔍 Initializing token plugin...');
  const tokenPlugin = new TokenPlugin();

  // Create Birdeye provider with API key
  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });

  // Create and configure the wallet plugin
  console.log('🔄 Initializing wallet plugin...');
  const walletPlugin = new WalletPlugin();
  // Create provider with API key
  const bnbProvider = new BnbProvider({
    rpcUrl: BNB_RPC,
  });

  const alchemyProvider = new AlchemyProvider({
    apiKey: settings.get('ALCHEMY_API_KEY'),
  });

  // Initialize plugin with provider
  await walletPlugin.initialize({
    defaultChain: 'bnb',
    providers: [bnbProvider, alchemyProvider],
    supportedChains: ['bnb'],
  });
  // Configure the plugin with supported chains
  await tokenPlugin.initialize({
    defaultChain: 'bnb',
    providers: [birdeye],
    supportedChains: ['solana', 'bnb'],
  });
  console.log('✓ Token plugin initialized\n');

  // Create providers with proper chain IDs
  const pancakeswap = new PancakeSwapProvider(provider, 56);
  const jupiter = new JupiterProvider(new Connection(SOL_RPC));

  // const okx = new OkxProvider(provider, 56);

  // const fourMeme = new FourMemeProvider(provider, 56);

  // Configure the plugin with supported chains
  await swapPlugin.initialize({
    defaultSlippage: 0.5,
    defaultChain: 'bnb',
    providers: [pancakeswap, jupiter],
    supportedChains: ['bnb', 'ethereum', 'solana'], // These will be intersected with agent's networks
  });
  console.log('✓ Swap plugin initialized\n');

  // Create providers with proper chain IDs
  // const debridge = new deBridgeProvider(provider);
  // Configure the plugin with supported chains
  // await bridgePlugin.initialize({
  //   defaultChain: 'bnb',
  //   providers: [debridge],
  //   supportedChains: ['bnb', 'solana'], // These will be intersected with agent's networks
  // });

  console.log('✓ Bridge plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering swap plugin with agent...');
  await agent.registerPlugin(swapPlugin);
  console.log('✓ Plugin registered\n');

  console.log('🔌 Registering wallet plugin with agent...');
  await agent.registerPlugin(walletPlugin);
  console.log('✓ Plugin registered\n');

  console.log('🔌 Registering token plugin with agent...');
  await agent.registerPlugin(tokenPlugin);
  console.log('✓ Plugin registered\n');

  console.log('🔌 Registering bridge plugin with agent...');
  await agent.registerPlugin(bridgePlugin);
  console.log('✓ Plugin registered\n');

  // Example 1: Buy with exact input amount on BNB Chain
  // console.log('💱 Example 1: Buy BINK from exactly 0.0001 BNB with 0.5% slippage on bnb chain.');
  // const result1 = await agent.execute({
  //   input: `
  //     Buy BINK from exactly 0.0001 BNB with 0.5% slippage on bnb chain.
  //   `,
  //   //input: `swap crosschain 5 WETH on BNB to JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN on solana`,
  // });
  // console.log('✓ Swap result:', result1, '\n');

  // Example 2: Sell with exact output amount on BNB Chain
  console.log('💱 Example 2: buy BINK from 10 USDC on solana');
  const result2 = await agent.execute({
    input: `
   SELL all USDC to BNB on bnb chain
    `,
  });

  console.log('✓ Swap result:', result2, '\n');

  // Get plugin information
  // const registeredPlugin = agent.getPlugin('swap') as SwapPlugin;
  const registeredPlugin = agent.getPlugin('bridge') as BridgePlugin;

  // // Check available providers for each chain
  console.log('📊 Available providers by chain:');
  const chains = registeredPlugin.getSupportedNetworks();
  for (const chain of chains) {
    const providers = registeredPlugin.getProvidersForNetwork(chain);
    console.log(`Chain ${chain}:`, providers.map(p => p.getName()).join(', '));
  }
  // console.log();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
