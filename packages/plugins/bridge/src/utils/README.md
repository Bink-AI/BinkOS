# Bridge Provider Utilities

This directory contains utility functions used by the bridge providers.

## Token Utilities

### `tokenUtils.ts`

Contains utilities for handling token amounts and precision issues:

- `adjustTokenAmount`: Adjusts a token amount to handle precision issues
- `isWithinTolerance`: Checks if the difference between two amounts is within an acceptable tolerance
- `formatTokenAmount`: Formats a token amount with appropriate decimals
- `parseTokenAmount`: Parses a token amount string to BigInt with appropriate decimals

## Network Utilities

### `networkUtils.ts`

Contains utilities for network validation and provider management:

- `isSolanaNetwork`: Checks if a network is a Solana network
- `isProviderInstance`: Checks if a provider is an EVM provider
- `isSolanaProvider`: Checks if a provider is a Solana provider
- `getEvmProviderForNetwork`: Gets the EVM provider for a specific network
- `getSolanaProviderForNetwork`: Gets the Solana provider for a specific network
- `isNetworkSupported`: Checks if a network is supported by a provider
- `validateNetwork`: Validates if a network is supported

## Token Operations

### `tokenOperations.ts`

Contains utilities for token information retrieval and caching:

- `getTokenInfo`: Gets token information from the blockchain
- `createTokenCache`: Creates a token cache manager
- `createTokenBalanceCache`: Creates a token balance cache manager
- `isNativeToken`: Checks if a token is a native token

## Token Caching

The `createTokenCache` function creates a cache manager for token information. This helps reduce redundant blockchain calls and improves performance.

### Features

- Caches token information for a configurable TTL (default: 30 minutes)
- Handles both EVM and Solana tokens (Solana implementation pending)
- Provides methods to get token information from cache or blockchain
- Automatically cleans up expired entries

### Usage

```typescript
// Create a token cache
const tokenCache = createTokenCache();

// Get token information (from cache if available, or fetch from blockchain)
const token = await tokenCache.getToken(tokenAddress, network, providers, providerName);

// Clear expired entries
tokenCache.clearExpiredEntries();
```

### Implementation in BaseBridgeProvider

The `BaseBridgeProvider` class uses the token cache for all token-related operations:

- Getting token information in `getToken`
- Retrieving token decimals for amount calculations
- Fetching token symbols for user messages

## Token Balance Caching

The `createTokenBalanceCache` function creates a cache manager for token balances. This helps reduce redundant blockchain calls and improves performance.

### Features

- Caches token balances for a configurable TTL (default: 1 minute)
- Handles both native tokens and ERC20 tokens
- Provides methods to invalidate specific cache entries
- Automatically cleans up expired entries

### Usage

```typescript
// Create a balance cache
const balanceCache = createTokenBalanceCache();

// Get a token balance (from cache if available, or fetch from blockchain)
const { balance, formattedBalance } = await balanceCache.getTokenBalance(
  tokenAddress,
  walletAddress,
  network,
  providers,
  providerName,
  decimals,
);

// Invalidate a specific balance (e.g., after a transaction)
balanceCache.invalidateBalance(tokenAddress, walletAddress, network);

// Clear expired entries
balanceCache.clearExpiredEntries();

// Clear all balances
balanceCache.clearAllBalances();
```

### Implementation in BaseBridgeProvider

The `BaseBridgeProvider` class uses the token balance cache for all balance-related operations:

- Checking token balances in `checkBalance`
- Adjusting token amounts in `adjustAmount`

The cache is automatically invalidated when transactions are built, ensuring that subsequent balance checks use fresh data.

## Cache Cleanup

Both token and balance caches are automatically cleaned up periodically (every 5 minutes) to prevent memory leaks. This is handled by the `setupCacheCleanup` method in the `BaseBridgeProvider` class.
