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
  PlanningAgent,
} from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { OkxProvider } from '@binkai/okx-provider';
import { ThenaProvider } from '@binkai/thena-provider';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { Connection } from '@solana/web3.js';
import { TokenPlugin } from '@binkai/token-plugin';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { BridgePlugin } from '@binkai/bridge-plugin';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { WalletPlugin } from '@binkai/wallet-plugin';
import { BnbProvider } from '@binkai/rpc-provider';
import { KyberProvider } from '@binkai/kyber-provider';
import { AlchemyProvider } from '@binkai/alchemy-provider';
import { HyperliquidProvider } from '@binkai/hyperliquid-provider';
import { DodoProvider } from '@binkai/dodo-provider';

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';
const BASE_RPC = 'https://base.llamarpc.com';
const HYPERLIQUID_RPC = 'https://rpc.hyperliquid.xyz/evm';

async function main() {
  console.log('🚀 Starting BinkOS swap example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 OpenAI API key found\n');

  //configure enable logger
  logger.enable();

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
    [NetworkName.BASE]: {
      type: 'evm' as NetworkType,
      config: {
        chainId: 8453,
        rpcUrl: BASE_RPC,
        name: 'Base',
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
      },
    },
    [NetworkName.HYPERLIQUID]: {
      type: 'evm' as NetworkType,
      config: {
        chainId: 999,
        rpcUrl: HYPERLIQUID_RPC,
        name: 'Hyperliquid',
        nativeCurrency: {
          name: 'Hyperliquid',
          symbol: 'HYPE',
          decimals: 18,
        },
      },
    },
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });

  const alchemyProvider = new AlchemyProvider({
    apiKey: settings.get('ALCHEMY_API_KEY'),
  });

  const walletPlugin = new WalletPlugin();

  const tokenPlugin = new TokenPlugin();
  await tokenPlugin.initialize({
    // defaultChain: 'solana',
    providers: [birdeye, alchemyProvider],
    supportedChains: ['solana', 'bnb', 'ethereum', 'base', 'hyperliquid'],
  });
  console.log('✓ Token plugin initialized\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

  // Initialize provider
  console.log('🔌 Initializing provider...');
  const bnbProvider = new ethers.JsonRpcProvider(BNB_RPC);
  const solProvider = new Connection(SOL_RPC);
  const ethProvider = new ethers.JsonRpcProvider(ETH_RPC);
  const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);
  const hyperliquidProvider = new ethers.JsonRpcProvider(HYPERLIQUID_RPC);

  const ChainId = {
    BSC: 56,
    ETH: 1,
    BASE: 8453,
    HYPERLIQUID: 999,
  };

  const bnbProviderOS = new BnbProvider({
    rpcUrl: BNB_RPC,
  });
  await walletPlugin.initialize({
    // defaultChain: 'bnb',
    providers: [bnbProviderOS, alchemyProvider, birdeye],
    supportedChains: ['bnb', 'solana', 'base', 'hyperliquid'],
  });
  console.log('✓ Provider initialized\n');

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

  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));
  console.log('🤖 Wallet ETH:', await wallet.getAddress(NetworkName.ETHEREUM));
  console.log('🤖 Wallet SOL:', await wallet.getAddress(NetworkName.SOLANA));
  console.log('🤖 Wallet BASE:', await wallet.getAddress(NetworkName.BASE));
  console.log('🤖 Wallet HYPERLIQUID:', await wallet.getAddress(NetworkName.HYPERLIQUID));
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
      systemPrompt: `You are a BINK AI agent. You are able to perform swaps, bridges and get token information on multiple chains. 
        If you do not have the token address, you can use the symbol to get the token information before performing a bridge or swap.
        For hyperliquid chain action. you do not need to get token info`,
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  // Create and configure the swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();

  // Create providers with proper chain IDs
  const okx = new OkxProvider(bnbProvider, 56);
  const jupiter = new JupiterProvider(solProvider);
  const thena = new ThenaProvider(ethProvider, 1);
  const kyberBNB = new KyberProvider(bnbProvider, 56);
  const kyberBase = new KyberProvider(baseProvider, 8453);
  const hyperliquid = new HyperliquidProvider(hyperliquidProvider, ChainId.HYPERLIQUID);

  const dodoBnb = new DodoProvider({
    provider: bnbProvider,
    chainId: ChainId.BSC,
    apiKey: settings.get('DODO_API_KEY') || '',
  });

  // Configure the plugin with supported chains
  await swapPlugin.initialize({
    defaultSlippage: 0.5,
    // defaultChain: 'bnb',
    providers: [okx, thena, jupiter, kyberBNB, kyberBase, hyperliquid],
    supportedChains: ['bnb', 'ethereum', 'solana', 'base', 'hyperliquid'], // These will be intersected with agent's networks
  });

  console.log('✓ Swap plugin initialized\n');

  const bridgePlugin = new BridgePlugin();

  const debridge = new deBridgeProvider([bnbProvider, solProvider], 56, 7565164);

  // Configure the plugin with supported chains
  await bridgePlugin.initialize({
    // defaultChain: 'bnb',
    providers: [debridge],
    supportedChains: ['bnb', 'solana', 'base'], // These will be intersected with agent's networks
  });

  // Register the plugin with the agent
  console.log('🔌 Registering plugins with agent...');
  //   await agent.registerPlugin(swapPlugin);
  await agent.registerPlugin(walletPlugin);
  await agent.registerListPlugins([swapPlugin, tokenPlugin, bridgePlugin]);
  console.log('✓ Plugin registered\n');

  // Example 1: Buy with exact input amount on BNB Chain
  console.log('💱 Example 1: Buy with exact input amount all providers');
  const result = await agent.execute({
    input: `
     Sell 0.6 USDC to BNB via dodo with 0.5% slippage on bnb chain.
      Use the following token addresses:
      USDC: 0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d
    `,
  });
  console.log('✓ Result:', result, '\n');

  //  Example 2: Sell with exact output amount on Hyperliquid Chain
  // console.log('💱 Example 2: Sell with exact output amount on Hyperliquid Chain');
  // const result2 = await agent.execute({
  //   input: `
  //     Sell 0.3 hype to usdc on hyperliquid chain by hyperliquid .
  //     Use the following token addresses:
  //      HYPE: 0x0d01dc56dcaaca66ad901c959b4011ec
  //      USDC: 0x6d1e7cde53ba9467b783cb7c530ce054
  //   `,
  // });

  // console.log('✓ Swap result:', result2, '\n');

  // Example 3 : Check my balance on base chain
  console.log('💱 Example 3: Check my balance on base chain');
  const result = await agent.execute({
    input: `
      sell 0.001 bnb to usdc on bnb chain on kyber
    `,
  });
  console.log('✓ Result:', result, '\n');

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
