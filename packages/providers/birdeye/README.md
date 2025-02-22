# @binkai/birdeye-provider

A powerful Birdeye integration provider for BinkOS that enables comprehensive token data and price discovery across multiple blockchain networks, with a focus on Solana and BNB Chain.

## Overview

The Birdeye provider implements the token provider interface for BinkOS, enabling direct access to Birdeye's extensive token data API. It provides real-time price feeds, market data, and token information across multiple supported networks.

## Features

- 👁️ **Birdeye Integration**: Direct access to Birdeye's functionality

  - Token price data
  - Market analytics
  - Trading volume information
  - Token metadata

- ⚡ **Multi-Chain Support**: Support for multiple blockchain networks
  - Solana
  - BNB Chain
  - More chains coming soon...
- 📊 **Real-time Data**: Live price and market information
- 🔍 **Comprehensive Analytics**: Detailed token and market analysis
- 🔌 **Plugin Ready**: Seamless integration with BinkOS token plugin

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/birdeye-provider

# Install required peer dependencies
pnpm add @binkai/core
```

## Usage

Here's how to integrate and use the Birdeye provider with BinkOS:

```typescript
import { BirdeyeProvider } from '@binkai/birdeye-provider';

// Initialize Birdeye provider with API key
const birdeye = new BirdeyeProvider({
  apiKey: process.env.BIRDEYE_API_KEY,
});

// Use with token plugin
const tokenPlugin = new TokenPlugin();
await tokenPlugin.initialize({
  defaultChain: 'bnb',
  providers: [birdeye],
  supportedChains: ['solana', 'bnb'],
});

// Register with BinkOS agent
await agent.registerPlugin(tokenPlugin);

// Execute token information queries
const result = await agent.execute({
  input: 'Get price of BINK token on BNB Chain',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/example.ts](../../../examples/basic/src/example.ts). This example demonstrates:

- Provider initialization
- Integration with token plugin
- Token data queries
- Market analytics
- Best practices

## Configuration

The provider can be configured with the following parameters:

```typescript
interface BirdeyeProviderConfig {
  apiKey: string; // Birdeye API key
  baseUrl?: string; // Optional custom API endpoint
}
```

## Supported Operations

The Birdeye provider supports the following operations:

- Token price discovery
- Market data retrieval
- Trading volume analysis
- Token metadata queries
- Historical price data
- Market trends analysis

## Environment Setup

Required configuration:

```bash
# Required environment variables
BIRDEYE_API_KEY=your_birdeye_api_key
```

## Supported Data Types

The provider offers comprehensive token information including:

- Real-time prices
- 24h price changes
- Trading volume
- Market capitalization
- Token metadata
- Historical data
- Market trends

## Special Features

- 📈 **Advanced Analytics**: Comprehensive market analysis
- 🔄 **Real-time Updates**: Live price and market data
- 📊 **Historical Data**: Access to historical price information
- 🎯 **Token Discovery**: Detailed token information and metadata

## Error Handling

The provider implements comprehensive error handling for common scenarios:

- API rate limits
- Invalid tokens
- Network issues
- Authentication errors
- Data availability issues

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
- [@binkai/token-plugin](../../plugins/token/README.md) - Token plugin for BinkOS
