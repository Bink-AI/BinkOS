import { TokenInfo } from '../types';
import { NetworkName } from '@binkai/core';

// Define token lists by network
export const defaultTokens: Partial<Record<NetworkName, Record<string, TokenInfo>>> = {
  // BNB Chain (BSC) tokens
  [NetworkName.BNB]: {
    // BNB - Native token
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': {
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      symbol: 'BNB',
      name: 'Binance Coin',
      decimals: 18,
      network: NetworkName.BNB,
      logoURI: 'https://tokens.pancakeswap.finance/images/symbol/bnb.png',
      verified: true,
    },
    '0x5fdfafd107fc267bd6d6b1c08fcafb8d31394ba1': {
      address: '0x5fdfafd107fc267bd6d6b1c08fcafb8d31394ba1',
      symbol: 'BINK',
      name: 'Bink AI',
      decimals: 18,
      network: NetworkName.BNB,
      logoURI:
        'https://tokens.pancakeswap.finance/images/0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1.png',
      verified: true,
    },
    // BUSD
    '0xe9e7cea3dedca5984780bafc599bd69add087d56': {
      address: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
      symbol: 'BUSD',
      name: 'Binance USD',
      decimals: 18,
      network: NetworkName.BNB,
      logoURI: 'https://tokens.pancakeswap.finance/images/symbol/busd.png',
      verified: true,
    },
    // USDT
    '0x55d398326f99059ff775485246999027b3197955': {
      address: '0x55d398326f99059ff775485246999027b3197955',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 18,
      network: NetworkName.BNB,
      logoURI: 'https://tokens.pancakeswap.finance/images/symbol/usdt.png',
      verified: true,
    },
    // CAKE
    '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82': {
      address: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
      symbol: 'CAKE',
      name: 'PancakeSwap Token',
      decimals: 18,
      network: NetworkName.BNB,
      logoURI: 'https://tokens.pancakeswap.finance/images/symbol/cake.png',
      verified: true,
    },
    // USDC
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': {
      address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 18,
      network: NetworkName.BNB,
      logoURI: 'https://tokens.pancakeswap.finance/images/symbol/usdc.png',
      verified: true,
    },
  },

  // Ethereum tokens
  [NetworkName.ETHEREUM]: {
    // ETH - Native token
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': {
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      network: NetworkName.ETHEREUM,
      logoURI: 'https://tokens.uniswap.org/images/ethereum.png',
      verified: true,
    },
    // USDT
    '0xdac17f958d2ee523a2206206994597c13d831ec7': {
      address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      network: NetworkName.ETHEREUM,
      logoURI: 'https://tokens.uniswap.org/images/usdt.png',
      verified: true,
    },
    // USDC
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      network: NetworkName.ETHEREUM,
      logoURI: 'https://tokens.uniswap.org/images/usdc.png',
      verified: true,
    },
    // WBTC
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': {
      address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      network: NetworkName.ETHEREUM,
      logoURI: 'https://tokens.uniswap.org/images/wbtc.png',
      verified: true,
    },
  },

  // Solana tokens
  [NetworkName.SOLANA]: {
    // SOL - Native token
    So11111111111111111111111111111111111111111: {
      address: 'So11111111111111111111111111111111111111111',
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      network: NetworkName.SOLANA,
      logoURI:
        'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111111/logo.png',
      verified: true,
    },
    // USDC
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      network: NetworkName.SOLANA,
      logoURI:
        'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      verified: true,
    },
    // USDT
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
      address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      network: NetworkName.SOLANA,
      logoURI:
        'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
      verified: true,
    },
    // Bonk
    DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
      address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      symbol: 'BONK',
      name: 'Bonk',
      decimals: 5,
      network: NetworkName.SOLANA,
      logoURI:
        'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
      verified: true,
    },
    // Raydium
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': {
      address: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      symbol: 'RAY',
      name: 'Raydium',
      decimals: 6,
      network: NetworkName.SOLANA,
      logoURI:
        'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
      verified: true,
    },
    // Jupiter
    JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: {
      address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: 'JUP',
      name: 'Jupiter',
      decimals: 6,
      network: NetworkName.SOLANA,
      logoURI:
        'https://tokens.debridge.finance/Logo/7565164/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/small/token-logo.png',
      verified: true,
    },
    // TRUMP
    '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': {
      address: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
      symbol: 'TRUMP',
      name: 'Official Trump',
      decimals: 6,
      network: NetworkName.SOLANA,
      logoURI:
        'https://tokens.debridge.finance/Logo/7565164/6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN/small/token-logo.png',
      verified: true,
    },
  },
};

// Export a function to get tokens for a specific network
export function getDefaultTokensForNetwork(network: NetworkName): Record<string, TokenInfo> {
  return defaultTokens[network] || {};
}

// Export a function to get all supported networks
export function getSupportedNetworks(): NetworkName[] {
  return Object.keys(defaultTokens) as NetworkName[];
}
