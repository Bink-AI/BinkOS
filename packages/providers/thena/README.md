# @binkai/kyber-provider

A powerful KyberSwap integration provider for BinkOS that enables seamless token swaps across multiple chains through the KyberSwap decentralized exchange.

## Overview

The KyberSwap provider implements the swap provider interface for BinkOS, enabling direct integration with KyberSwap's liquidity pools and smart contracts. It provides optimized routing, accurate price quotes, and efficient token swaps across multiple supported chains.

## Features

- 💫 **KyberSwap Integration**: Direct access to KyberSwap's functionality

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
pnpm add @binkai/kyber-provider

# Install required peer dependencies
pnpm add @binkai/core ethers
```

## Usage

Here's how to integrate and use the KyberSwap provider with BinkOS:

```typescript
import { KyberProvider } from '@binkai/kyber-provider';
import { ethers } from 'ethers';

// Initialize provider with RPC and chain ID
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const kyber = new KyberProvider(provider, 56); // 56 is BNB Chain's chainId

// Use with swap plugin
const swapPlugin = new SwapPlugin();
await swapPlugin.initialize({
  defaultSlippage: 0.5,
  defaultChain: 'bnb',
  providers: [kyber],
  supportedChains: ['bnb', 'ethereum'],
});

// Register with BinkOS agent
await agent.registerPlugin(swapPlugin);

// Execute swap operations through natural language
const result = await agent.execute({
  input: `
    Buy BINK from exactly 0.0001 BNB on KyberSwap with 10% slippage on bnb chain.
    Use the following token addresses:
    BINK: 0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1
  `,
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/swap-example-kyber.ts](../../../examples/basic/src/swap-example-kyber.ts). This example demonstrates:

- Provider initialization
- Integration with swap plugin
- Executing trades
- Error handling
- Best practices

## Configuration

The provider can be configured with the following parameters:

```typescript
interface KyberProviderConfig {
  provider: ethers.Provider; // Ethers provider instance
  chainId: number; // Chain ID (56 for BNB Chain, 1 for Ethereum)
}
```

## Supported Operations

The KyberSwap provider supports the following operations:

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

## Natural Language Commands

The provider supports various natural language commands through the BinkOS agent:

- `Buy [token] from exactly [amount] [token] on KyberSwap with [slippage]% slippage on [chain] chain`
- `Sell exactly [amount] [token] to [token] on KyberSwap with [slippage]% slippage on [chain] chain`

## Supported Tokens

The provider supports all tokens available on KyberSwap, including:

- Native tokens (BNB, ETH)
- ERC-20/BEP-20 tokens
- Popular trading pairs
- Cross-chain assets
- Custom tokens (with address)

## Special Features

- 🎯 **Dynamic Routing**: Smart routing across multiple pools
- 💧 **Deep Liquidity**: Access to KyberSwap's liquidity pools
- 📊 **Price Analytics**: Real-time price information
- 🛡️ **Safety Features**: Built-in slippage protection

## Error Handling

The provider implements comprehensive error handling for common scenarios:

- Insufficient liquidity
- Price impact too high
- Transaction failures
- Network issues
- Invalid token addresses

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
