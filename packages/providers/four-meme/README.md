# @binkai/four-meme-provider

A specialized FourMeme DEX integration provider for BinkOS that enables seamless token swaps on BNB Chain through the FourMeme decentralized exchange, focusing on meme tokens and community-driven assets.

## Overview

The FourMeme provider implements the swap provider interface for BinkOS, enabling direct integration with FourMeme DEX's liquidity pools and smart contracts. It provides optimized routing, accurate price quotes, and efficient token swaps for meme tokens and community assets on BNB Chain.

## Features

- 🎭 **FourMeme Integration**: Direct access to FourMeme's functionality

  - Meme token swaps
  - Price quotes
  - Liquidity pool information
  - Smart routing

- ⚡ **BNB Chain Support**: Native support for BNB Chain operations
- 💰 **Optimal Routing**: Best price discovery for meme tokens
- 🔒 **Secure Transactions**: Safe and reliable swap execution
- 🔌 **Plugin Ready**: Seamless integration with BinkOS swap plugin

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/four-meme-provider

# Install required peer dependencies
pnpm add @binkai/core ethers
```

## Usage

Here's how to integrate and use the FourMeme provider with BinkOS:

```typescript
import { FourMemeProvider } from '@binkai/four-meme-provider';
import { ethers } from 'ethers';

// Initialize provider with RPC and chain ID
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const fourMeme = new FourMemeProvider(provider, 56); // 56 is BNB Chain's chainId

// Use with swap plugin
const swapPlugin = new SwapPlugin();
await swapPlugin.initialize({
  defaultSlippage: 0.5,
  defaultChain: 'bnb',
  providers: [fourMeme],
  supportedChains: ['bnb'],
});

// Register with BinkOS agent
await agent.registerPlugin(swapPlugin);

// Execute swap operations
const result = await agent.execute({
  input: 'Buy BINK from exactly 0.0001 BNB with 0.5% slippage on bnb chain',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/example.ts](../../../examples/basic/src/example.ts). This example demonstrates:

- Provider initialization
- Integration with swap plugin
- Executing trades
- Error handling
- Best practices

## Configuration

The provider can be configured with the following parameters:

```typescript
interface FourMemeProviderConfig {
  provider: ethers.Provider; // Ethers provider instance
  chainId: number; // Chain ID (56 for BNB Chain)
}
```

## Supported Operations

The FourMeme provider supports the following operations:

- Token swaps with exact input
- Token swaps with exact output
- Price quotes and estimations
- Slippage protection
- Meme token-specific optimizations

## Environment Setup

Required configuration:

```typescript
// Initialize with BNB Chain RPC
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const chainId = 56; // BNB Chain
```

## Supported Tokens

The provider supports all tokens available on FourMeme DEX, including:

- Native BNB
- Popular meme tokens
- Community-driven assets
- BEP-20 tokens
- Newly listed meme tokens

## Special Features

- 🎯 **Meme Token Focus**: Specialized routing for meme tokens
- 🌊 **Community Pools**: Access to community-driven liquidity pools
- 📊 **Meme Market Data**: Specialized price feeds for meme tokens
- 🛡️ **Safety Features**: Additional checks for meme token trades

## Error Handling

The provider implements comprehensive error handling for common scenarios:

- Insufficient liquidity
- Price impact too high
- Transaction failures
- Network issues
- Meme token-specific validations

## Development

```bash
# Install dependencies
pnpm install

# Build the provider
pnpm build

# Run tests
pnpm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This package is part of the BinkOS project. All rights reserved.

## Related Packages

- [@binkai/core](../../core/README.md) - Core BinkOS functionality
- [@binkai/swap-plugin](../../plugins/swap/README.md) - Swap plugin for BinkOS
