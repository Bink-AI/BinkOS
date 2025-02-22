# @binkai/debridge-provider

A powerful deBridge integration provider for BinkOS that enables seamless cross-chain asset transfers through the deBridge protocol, supporting multiple blockchain networks.

## Overview

The deBridge provider implements the bridge provider interface for BinkOS, enabling direct integration with deBridge's cross-chain infrastructure. It provides optimized routing, secure asset transfers, and efficient bridging operations across multiple supported networks.

## Features

- 🌉 **deBridge Integration**: Direct access to deBridge's functionality

  - Cross-chain transfers
  - Asset bridging
  - Liquidity management
  - Smart routing

- ⚡ **Multi-Chain Support**: Support for multiple blockchain networks
  - BNB Chain
  - Solana
  - Ethereum
  - More chains coming soon...
- 💰 **Optimal Routing**: Best path discovery for cross-chain transfers
- 🔒 **Secure Transfers**: Safe and reliable bridging operations
- 🔌 **Plugin Ready**: Seamless integration with BinkOS bridge plugin

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/debridge-provider

# Install required peer dependencies
pnpm add @binkai/core ethers
```

## Usage

Here's how to integrate and use the deBridge provider with BinkOS:

```typescript
import { deBridgeProvider } from '@binkai/debridge-provider';
import { ethers } from 'ethers';

// Initialize provider with RPC
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const debridge = new deBridgeProvider(provider);

// Use with bridge plugin
const bridgePlugin = new BridgePlugin();
await bridgePlugin.initialize({
  defaultChain: 'bnb',
  providers: [debridge],
  supportedChains: ['bnb', 'solana'],
});

// Register with BinkOS agent
await agent.registerPlugin(bridgePlugin);

// Execute bridge operations
const result = await agent.execute({
  input: 'Bridge 0.005 BNB to SOL',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/bridge-example.ts](../../../examples/basic/src/bridge-example.ts). This example demonstrates:

- Provider initialization
- Integration with bridge plugin
- Cross-chain transfers
- Error handling
- Best practices

## Configuration

The provider can be configured with the following parameters:

```typescript
interface deBridgeProviderConfig {
  provider: ethers.Provider; // Ethers provider instance for EVM chains
}
```

## Supported Operations

The deBridge provider supports the following operations:

- Cross-chain asset transfers
- Token bridging between networks
- Price quotes and fee estimations
- Liquidity checks
- Smart contract interactions

## Environment Setup

Required configuration:

```typescript
// Initialize with BNB Chain RPC for EVM operations
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');

// For Solana operations
const solRpcUrl = 'https://api.mainnet-beta.solana.com';
```

## Supported Networks

The provider supports cross-chain operations between:

- BNB Chain
- Solana
- Ethereum
- More networks coming soon...

## Special Features

- 🌐 **Cross-Chain Routing**: Intelligent path finding across networks
- 💧 **Liquidity Management**: Access to deep cross-chain liquidity
- 📊 **Bridge Analytics**: Real-time transfer monitoring
- 🛡️ **Security Features**: Advanced validation and safety checks

## Error Handling

The provider implements comprehensive error handling for common scenarios:

- Insufficient liquidity
- Network congestion
- Failed transfers
- Chain-specific issues
- Bridge protocol errors

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
- [@binkai/bridge-plugin](../../plugins/bridge/README.md) - Bridge plugin for BinkOS
