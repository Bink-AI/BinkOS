# @binkai/token-plugin

A powerful token information and price discovery plugin for BinkOS that provides comprehensive token data across multiple blockchain networks with AI-powered analytics.

## Overview

The token plugin provides seamless access to token information, prices, and market data through the BinkOS agent system. It supports multiple blockchain networks and data providers, offering real-time token information and price discovery capabilities.

## Features

- 🔍 **Multi-Provider Support**: Integration with major token data providers

  - Birdeye (Solana, BNB Chain)
  - More providers coming soon...

- 🤖 **AI-Powered Analytics**: Intelligent token analysis and price discovery
- ⚡ **Cross-Chain Support**: Token information across multiple networks
  - Solana
  - BNB Chain
  - More chains coming soon...
- 📊 **Market Data**: Comprehensive token market information
- 🔌 **Extensible Architecture**: Easy integration of new data providers

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/token-plugin

# Install required peer dependencies
pnpm add @binkai/core
```

## Usage

Here's how to integrate and use the token plugin with BinkOS:

```typescript
import { TokenPlugin } from '@binkai/token-plugin';
import { BirdeyeProvider } from '@binkai/birdeye-provider';

// Create and configure the token plugin
const tokenPlugin = new TokenPlugin();

// Initialize Birdeye provider with API key
const birdeye = new BirdeyeProvider({
  apiKey: process.env.BIRDEYE_API_KEY,
});

// Initialize the plugin
await tokenPlugin.initialize({
  defaultChain: 'bnb',
  providers: [birdeye],
  supportedChains: ['solana', 'bnb'],
});

// Register with BinkOS agent
await agent.registerPlugin(tokenPlugin);

// Execute token operations through natural language
const result = await agent.execute({
  input: 'Get price of BINK token on BNB Chain',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/example.ts](../../../examples/basic/src/example.ts)

## Supported Data Providers

Each data provider can be configured separately:

### Birdeye

```typescript
const birdeye = new BirdeyeProvider({
  apiKey: 'your_birdeye_api_key',
});
```

## Configuration Options

The plugin accepts the following configuration options:

```typescript
interface TokenPluginConfig {
  defaultChain: string; // Default chain for operations
  providers: TokenProvider[]; // Array of token data providers
  supportedChains: string[]; // Supported blockchain networks
}
```

## Natural Language Commands

The plugin supports various natural language commands through the BinkOS agent:

- `Get price of [token] on [chain]`
- `Get market cap of [token]`
- `Show token information for [token] on [chain]`
- `Get trading volume for [token]`
- More commands coming soon...

## Environment Setup

Required environment variables:

```bash
OPENAI_API_KEY=your_openai_api_key
BIRDEYE_API_KEY=your_birdeye_api_key
```

## Token Information

The plugin provides comprehensive token information including:

- Price data
- Market capitalization
- Trading volume
- Price changes
- Token metadata
- Contract information

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
- [@binkai/birdeye-provider](../providers/birdeye/README.md) - Birdeye data provider integration
