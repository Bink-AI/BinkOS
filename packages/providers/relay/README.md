# @binkai/relay-provider

A bridge provider implementation for the Relay protocol, enabling cross-chain token transfers between BNB Chain and Solana networks.

## Features

- Cross-chain token transfers between BNB Chain and Solana
- Support for both native tokens (BNB and SOL) and ERC20 tokens
- Automatic quote generation and transaction building
- Built-in support for Solana's Address Lookup Tables
- Comprehensive error handling and logging

## Installation

```bash
npm install @binkai/relay-provider
# or
yarn add @binkai/relay-provider
```

## Usage

```typescript
import { RelayProvider } from '@binkai/relay-provider';
import { Provider } from 'ethers';
import { Connection } from '@solana/web3.js';

// Initialize providers for both networks
const bnbProvider = new Provider(/* your BNB provider config */);
const solanaConnection = new Connection(/* your Solana connection config */);

// Create the relay provider instance
const relayProvider = new RelayProvider(
  [bnbProvider, solanaConnection],
  ChainID.BNB, // from chain (optional, defaults to BNB)
  ChainID.SOLANA, // to chain (optional, defaults to Solana)
);

// Get a quote for a cross-chain transfer
const quote = await relayProvider.getQuote(
  {
    fromNetwork: 'bnb',
    toNetwork: 'solana',
    fromToken: '0x...', // token address or native token address
    toToken: '...', // token address or native token address
    amount: '1000000000000000000', // amount in wei/lamports
    type: 'input', // or 'output'
  },
  '0x...', // from wallet address
  '...', // to wallet address
);

// Execute the transfer using the quote
// Implementation depends on your wallet integration
```

## Supported Networks

- BNB Chain
- Solana

## API Reference

### Constructor

```typescript
new RelayProvider(
  provider: [Provider, Connection],
  fromChainId?: ChainID,
  toChainId?: ChainID
)
```

### Methods

#### `getName(): string`

Returns the provider name ('relay').

#### `getSupportedNetworks(): NetworkName[]`

Returns an array of supported networks (['bnb', 'solana']).

#### `getQuote(params: BridgeParams, fromWalletAddress: string, toWalletAddress: string): Promise<BridgeQuote>`

Generates a quote for a cross-chain transfer.

#### `cleanup(): Promise<void>`

Performs any necessary cleanup operations.

## Dependencies

- @binkai/bridge-plugin
- @binkai/core
- @solana/web3.js
- @coral-xyz/anchor
- ethers
- axios

## License

MIT

## Homepage

Visit [Bink.ai](https://bink.ai/) for more information.
