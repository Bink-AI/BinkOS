# BNB Provider

A provider implementation for interacting with the BNB Chain (formerly BSC) to fetch wallet balances and token information.

## Overview

The BNB Provider is part of the Bink OS ecosystem, implementing the `IWalletProvider` interface to provide wallet and token balance functionality for the BNB Chain.

## Installation

To use the BNB Provider, you can install it via npm or yarn:

```bash
pnpm install @binkai/bnb-provider
```

## Features

- Fetch native BNB balance
- Get BEP-20 token balances
- Query token information and metadata

## Usage

### Basic Setup

```typescript
import { BNBProvider } from '@binkai/bnb-provider';

const provider = new BNBProvider({
  rpcUrl: 'https://bsc-dataseed.binance.org',
});
```

### Fetching Wallet Information

```typescript
// Get wallet balance and token holdings
const walletInfo = await provider.getWalletInfo('0x123...abc', 'bnb');

console.log('BNB Balance:', walletInfo.balance);
console.log('Tokens:', walletInfo.tokens);
```

### Token Operations

```typescript
// Get token information
const tokenInfo = await provider.getTokenInfo('0xtoken...address');

// Get token balance
const balance = await provider.getTokenBalance('0xwallet...address', '0xtoken...address');
```

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](../CONTRIBUTING.md) for details.

## License

MIT License - see the [LICENSE](../LICENSE) file for details.

## Related Packages

- @binkai/core
- @binkai/wallet-plugin
- @binkai/token-plugin
