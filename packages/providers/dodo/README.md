# @binkai/dodo-provider

Dodo DEX provider for BinkOS - A decentralized exchange provider that integrates with Dodo's API for token swaps on Ethereum.

## Installation

```bash
npm install @binkai/dodo-provider
```

## Usage

```typescript
import { ethers } from 'ethers';
import { DodoProvider } from '@binkai/dodo-provider';
import { SwapPlugin } from '@binkai/swap-plugin';

// Initialize provider
const provider = new ethers.JsonRpcProvider('YOUR_ETHEREUM_RPC_URL');
const dodoProvider = new DodoProvider(provider);

// Initialize swap plugin with Dodo provider
const swapPlugin = new SwapPlugin();
await swapPlugin.initialize({
  defaultSlippage: 0.5,
  defaultChain: 'ethereum',
  providers: [dodoProvider],
  supportedChains: ['ethereum'],
});

// Example: Get a quote for swapping tokens
const quote = await dodoProvider.getQuote(
  {
    fromToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
    toToken: '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
    amount: '1000000', // 1 USDC (6 decimals)
    type: 'input',
    network: 'ethereum',
    slippage: 0.5,
  },
  'YOUR_WALLET_ADDRESS',
);

console.log('Quote:', quote);
```

## Features

- Support for Ethereum network
- Native token (ETH) swaps
- Input and output amount quotes
- Slippage protection
- Price impact calculation
- Quote expiration handling

## API Reference

### DodoProvider

#### Constructor

```typescript
constructor(provider: Provider, chainId: ChainId = ChainId.ETH)
```

- `provider`: Ethereum provider instance
- `chainId`: Chain ID (defaults to Ethereum mainnet)

#### Methods

##### getName()

Returns the provider name: 'dodo'

##### getSupportedChains()

Returns array of supported chains: ['ethereum']

##### getSupportedNetworks()

Returns array of supported networks: [NetworkName.ETHEREUM]

##### getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote>

Gets a quote for swapping tokens.

Parameters:

- `params`: Swap parameters including fromToken, toToken, amount, type, network, and slippage
- `userAddress`: User's wallet address

Returns a SwapQuote object containing:

- quoteId
- network
- fromToken
- toToken
- fromAmount
- toAmount
- slippage
- type
- priceImpact
- route
- estimatedGas
- tx (transaction details)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## License

MIT
