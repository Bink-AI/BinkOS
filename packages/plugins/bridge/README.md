# @binkai/bridge-plugin

A powerful cross-chain bridge plugin for BinkOS that enables seamless asset transfers between different blockchain networks using AI-powered routing and multiple bridge providers.

## Overview

The bridge plugin provides intelligent cross-chain asset transfer capabilities through the BinkOS agent system. It supports multiple blockchain networks and automatically finds the best routes for bridging assets, with built-in support for popular bridge protocols.

## Features

- 🌉 **Multi-Bridge Support**: Integration with major bridge protocols

  - deBridge Finance
  - More bridges coming soon...

- 🤖 **AI-Powered Routing**: Intelligent route finding for optimal transfers
- ⚡ **Cross-Chain Compatibility**: Support for multiple blockchain networks
  - Solana
  - BNB Chain
  - Ethereum
  - More chains coming soon...
- 💰 **Fee Optimization**: Automatic selection of best routes and fees
- 🔌 **Extensible Providers**: Easy integration of new bridge providers

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/bridge-plugin

# Install required peer dependencies
pnpm add @binkai/core ethers
```

## Usage

Here's how to integrate and use the bridge plugin with BinkOS:

```typescript
import { BridgePlugin } from '@binkai/bridge-plugin';
import { deBridgeProvider } from '@binkai/debridge-provider';

// Initialize provider
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');

// Create and configure the bridge plugin
const bridgePlugin = new BridgePlugin();
const debridge = new deBridgeProvider(provider);

// Initialize the plugin
await bridgePlugin.initialize({
  defaultChain: 'bnb',
  providers: [debridge],
  supportedChains: ['bnb', 'solana'],
});

// Register with BinkOS agent
await agent.registerPlugin(bridgePlugin);

// Execute bridge operations through natural language
const result = await agent.execute({
  input: 'Bridge 0.005 SOL to BNB',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/bridge-example.ts](../../../examples/basic/src/bridge-example.ts).

## Supported Bridge Providers

Each bridge provider can be configured separately:

### deBridge Finance

```typescript
const debridge = new deBridgeProvider(provider);
```

## Configuration Options

The plugin accepts the following configuration options:

```typescript
interface BridgePluginConfig {
  defaultChain: string; // Default chain for operations
  providers: BridgeProvider[]; // Array of bridge providers
  supportedChains: string[]; // Supported blockchain networks
}
```

## Natural Language Commands

The plugin supports various natural language commands through the BinkOS agent:

- `Bridge [amount] [token] to [chain]`
- More commands coming soon...

## Environment Setup

Required environment variables:

```bash
OPENAI_API_KEY=your_openai_api_key
WALLET_MNEMONIC=your_wallet_mnemonic
```

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
- [@binkai/debridge-provider](../providers/debridge/README.md) - deBridge Finance integration
