# @binkai/okx-provider

A powerful OKX DEX integration provider for BinkOS that enables seamless token swaps across multiple chains through the OKX decentralized exchange.

## Overview

The OKX provider implements the swap provider interface for BinkOS, enabling direct integration with OKX DEX's liquidity pools and smart contracts. It provides optimized routing, accurate price quotes, and efficient token swaps across multiple supported chains.

## Features

- 🏦 **OKX DEX Integration**: Direct access to OKX's functionality

  - Token swaps
  - Price quotes
  - Liquidity pool information
  - Smart routing

- ⚡ **Multi-Chain Support**: Support for multiple blockchain networks
  - BNB Chain
  - Ethereum
  - More chains coming soon...
- 💰 **Optimal Routing**: Best price discovery across liquidity pools
- 🔒 **Secure Transactions**: Safe and reliable swap execution
- 🔌 **Plugin Ready**: Seamless integration with BinkOS swap plugin

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/okx-provider

# Install required peer dependencies
pnpm add @binkai/core ethers
```

## Usage

Here's how to integrate and use the OKX provider with BinkOS:

```typescript
import { OkxProvider } from '@binkai/okx-provider';
import { ethers } from 'ethers';

// Initialize provider with RPC and chain ID
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const okx = new OkxProvider(provider, 56); // 56 is BNB Chain's chainId

// Use with swap plugin
const swapPlugin = new SwapPlugin();
await swapPlugin.initialize({
  defaultSlippage: 0.5,
  defaultChain: 'bnb',
  providers: [okx],
  supportedChains: ['bnb', 'ethereum'],
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
interface OkxProviderConfig {
  provider: ethers.Provider; // Ethers provider instance
  chainId: number; // Chain ID (56 for BNB Chain, 1 for Ethereum)
}
```

## Supported Operations

The OKX provider supports the following operations:

- Token swaps with exact input
- Token swaps with exact output
- Cross-chain swaps
- Price quotes and estimations
- Slippage protection
- Multi-hop routing

## Environment Setup

Required configuration:

```typescript
// Initialize with BNB Chain RPC
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const chainId = 56; // BNB Chain

// Or for Ethereum
const ethProvider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
const ethChainId = 1; // Ethereum
```

## Supported Tokens

The provider supports all tokens available on OKX DEX, including:

- Native tokens (BNB, ETH)
- ERC-20/BEP-20 tokens
- Popular trading pairs
- Cross-chain assets
- Newly listed tokens

## Error Handling

The provider implements comprehensive error handling for common scenarios:

- Insufficient liquidity
- Price impact too high
- Transaction failures
- Network issues
- Cross-chain bridge failures

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
