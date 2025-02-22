# @binkai/swap-plugin

A powerful swap plugin for BinkOS that enables cross-chain token swaps with intelligent routing and multiple DEX support.

## Overview

The swap plugin provides seamless integration with various decentralized exchanges (DEXs) and enables AI-powered swap operations through the BinkOS agent system. It supports multiple chains and automatically finds the best routes for token swaps.

## Features

- 🔄 **Multi-DEX Support**: Integration with major DEXs

  - PancakeSwap (BNB Chain)
  - FourMeme (BNB Chain)
  - OKX DEX (Multi-Chain)
  - Jupiter (Solana)
  - Uniswap (Ethereum)
  - 1inch (Multi-chain)

- 🤖 **AI-Powered Routing**: Intelligent route finding for best prices
- ⚡ **Cross-Chain Compatibility**: Support for multiple blockchain networks
- 💰 **Slippage Control**: Configurable slippage protection
- 🔌 **Extensible Providers**: Easy integration of new DEX providers

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/swap-plugin

# Install required peer dependencies
pnpm add @binkai/core ethers
```

## Usage

Here's how to integrate and use the swap plugin with BinkOS:

```typescript
import { SwapPlugin } from '@binkai/swap-plugin';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { OkxProvider } from '@binkai/okx-provider';
import { FourMemeProvider } from '@binkai/four-meme-provider';

// Initialize providers
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const pancakeswap = new PancakeSwapProvider(provider, 56);
const okx = new OkxProvider(provider, 56);
const fourMeme = new FourMemeProvider(provider, 56);

// Create and configure the swap plugin
const swapPlugin = new SwapPlugin();
await swapPlugin.initialize({
  defaultSlippage: 0.5,
  defaultChain: 'bnb',
  providers: [okx, pancakeswap, fourMeme],
  supportedChains: ['bnb', 'ethereum'],
});

// Register with BinkOS agent
await agent.registerPlugin(swapPlugin);

// Execute swap operations through natural language
const result = await agent.execute({
  input: 'Buy BINK from exactly 0.0001 BNB with 0.5% slippage on bnb chain',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/example.ts](../../../examples/basic/src/example.ts).

## Supported DEX Providers

Each DEX provider can be configured separately:

### PancakeSwap

```typescript
const pancakeswap = new PancakeSwapProvider(provider, chainId);
```

### OKX DEX

```typescript
const okx = new OkxProvider(provider, chainId);
```

### FourMeme

```typescript
const fourMeme = new FourMemeProvider(provider, chainId);
```

## Configuration Options

The plugin accepts the following configuration options:

```typescript
interface SwapPluginConfig {
  defaultSlippage: number; // Default slippage percentage
  defaultChain: string; // Default chain for operations
  providers: SwapProvider[]; // Array of DEX providers
  supportedChains: string[]; // Supported blockchain networks
}
```

## Natural Language Commands

The plugin supports various natural language commands through the BinkOS agent:

- `Buy [token] from exactly [amount] [token] with [slippage]% slippage on [chain] chain`
- `Sell exactly [amount] [token] to [token] with [slippage]% slippage on [chain] chain`

## Development

```bash
# Install dependencies
pnpm install

# Build the plugin
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
- [@binkai/pancakeswap-provider](../providers/pancakeswap/README.md) - PancakeSwap integration
- [@binkai/okx-provider](../providers/okx/README.md) - OKX DEX integration
- [@binkai/four-meme-provider](../providers/four-meme/README.md) - FourMeme integration
