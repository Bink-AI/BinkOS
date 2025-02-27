import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';
import { IBridgeProvider, BridgeQuote, BridgeParams, Transaction } from './types';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';
import { adjustTokenAmount, DEFAULT_TOLERANCE_PERCENTAGE } from './utils/tokenUtils';
import { createTokenBalanceCache, createTokenCache, getTokenInfo } from './utils/tokenOperations';

export type NetworkProvider = Provider | Connection;

export abstract class BaseBridgeProvider implements IBridgeProvider {
  protected providers: Map<NetworkName, NetworkProvider> = new Map();
  protected tokenCache = createTokenCache();
  protected readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  protected quotes: Map<string, { quote: BridgeQuote; expiresAt: number }> = new Map();
  protected readonly QUOTE_EXPIRY = 5 * 60 * 1000; // 5 minutes
  protected readonly TOLERANCE_PERCENTAGE = DEFAULT_TOLERANCE_PERCENTAGE;
  // Initialize the token balance cache
  protected balanceCache = createTokenBalanceCache();

  // Network-specific gas buffers
  protected readonly GAS_BUFFERS: Record<NetworkName, bigint> = {
    [NetworkName.ETHEREUM]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.POLYGON]: ethers.parseEther('0.1'), // 0.1 MATIC
    [NetworkName.ARBITRUM]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.OPTIMISM]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.BNB]: ethers.parseEther('0.001'), // 0.001 BNB
    [NetworkName.SOLANA]: BigInt(10000000), // 0.001 SOL in lamports
    [NetworkName.SEPOLIA]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.SOLANA_DEVNET]: BigInt(10000000), // 0.001 SOL in lamports
  };

  constructor(providerConfig: Map<NetworkName, NetworkProvider>) {
    // Validate providers against supported networks
    const supportedNetworks = this.getSupportedNetworks();
    for (const [network, provider] of providerConfig.entries()) {
      if (!supportedNetworks.includes(network)) {
        throw new Error(`Networkk ${network} is not supported by ${this.getName()}`);
      }
      // Validate provider type based on network
      if (this.isSolanaNetwork(network) && !(provider instanceof Connection)) {
        throw new Error(`Invalid provider type for Solana network ${network}`);
      }
      if (!this.isSolanaNetwork(network) && !this.isProviderInstance(provider)) {
        throw new Error(`Invalid provider type for EVM network ${network}`);
      }
    }
    this.providers = providerConfig;

    // Set up periodic cache cleanup
    this.setupCacheCleanup();
  }

  protected isSolanaNetwork(network: NetworkName): boolean {
    return network === NetworkName.SOLANA || network === NetworkName.SOLANA_DEVNET;
  }

  protected isProviderInstance(provider: NetworkProvider): provider is Provider {
    return 'getNetwork' in provider && 'getBlockNumber' in provider;
  }

  protected isSolanaProvider(provider: NetworkProvider): provider is Connection {
    return provider instanceof Connection;
  }

  /**
   * Get the EVM provider for a specific network
   * @param network The network to get the provider for
   * @returns The EVM provider for the specified network
   * @throws Error if the network is not supported or if it's not an EVM network
   */
  protected getEvmProviderForNetwork(network: NetworkName): Provider {
    const provider = this.providers.get(network);
    if (!provider) {
      throw new Error(`Network ${network} is not supported by ${this.getName()}`);
    }
    if (!this.isProviderInstance(provider)) {
      throw new Error(`Network ${network} does not have an EVM provider`);
    }
    return provider;
  }

  /**
   * Get the Solana provider for a specific network
   * @param network The network to get the provider for
   * @returns The Solana provider for the specified network
   * @throws Error if the network is not supported or if it's not a Solana network
   */
  protected getSolanaProviderForNetwork(network: NetworkName): Connection {
    const provider = this.providers.get(network);
    if (!provider) {
      throw new Error(`Network ${network} is not supported by ${this.getName()}`);
    }
    if (!this.isSolanaProvider(provider)) {
      throw new Error(`Network ${network} does not have a Solana provider`);
    }
    return provider;
  }

  /**
   * Check if a network is supported by this provider
   * @param network The network to check
   * @returns True if the network is supported, false otherwise
   */
  protected isNetworkSupported(network: NetworkName): boolean {
    return this.getSupportedNetworks().includes(network) && this.providers.has(network);
  }

  abstract getName(): string;
  abstract getQuote(
    params: BridgeParams,
    fromWalletAddress: string,
    toWalletAddress: string,
  ): Promise<BridgeQuote>;
  abstract getSupportedNetworks(): NetworkName[];

  getPrompt?(): string;

  protected abstract isNativeToken(tokenAddress: string): boolean;
  protected abstract isNativeSolana(tokenAddress: string): boolean;

  /**
   * Validates if the network is supported
   * @param network The network to validate
   * @throws Error if the network is not supported
   */
  protected validateNetwork(network: NetworkName): void {
    if (!this.isNetworkSupported(network)) {
      throw new Error(`Network ${network} is not supported by ${this.getName()}`);
    }
  }

  /**
   * Get the gas buffer for a specific network
   * @param network The network to get the gas buffer for
   * @returns The gas buffer amount for the specified network
   */
  protected getGasBuffer(network: NetworkName): bigint {
    const buffer = this.GAS_BUFFERS[network];
    if (!buffer) {
      throw new Error(`No gas buffer defined for network ${network}`);
    }
    return buffer;
  }

  /**
   * Gets the token balance for a wallet address
   * @param tokenAddress The address of the token
   * @param walletAddress The address of the wallet
   * @param network The network to get the balance from
   * @param forceRefresh Whether to force a refresh of the cached balance
   * @returns A promise that resolves to the token balance (both bigint and formatted string)
   */
  protected async getTokenBalance(
    tokenAddress: string,
    walletAddress: string,
    network: NetworkName,
    forceRefresh: boolean = false,
  ): Promise<{ balance: bigint; formattedBalance: string }> {
    this.validateNetwork(network);

    // If force refresh, invalidate the cache entry
    if (forceRefresh) {
      this.balanceCache.invalidateBalance(tokenAddress, walletAddress, network);
    }

    // Get token info for decimals
    const token = await this.getToken(tokenAddress, network);

    // Use the balance cache to get the balance
    return await this.balanceCache.getTokenBalance(
      tokenAddress,
      walletAddress,
      network,
      this.providers,
      this.getName(),
      token.decimals,
    );
  }

  /**
   * Adjusts the input amount for native token swaps to account for gas costs
   * @param amount The original amount to spend
   * @param decimals The decimals of the token
   * @param walletAddress The address of the user
   * @param network The network to use
   * @returns The adjusted amount after accounting for gas buffer
   */
  protected async adjustNativeTokenAmount(
    amount: string,
    decimals: number,
    walletAddress: string,
    network: NetworkName,
  ): Promise<string> {
    this.validateNetwork(network);
    if (this.isSolanaNetwork(network)) {
      // TODO: Implement Solana

      console.log('isSolanaNetwork');
    }
    const provider = this.getEvmProviderForNetwork(network);
    const amountBN = ethers.parseUnits(amount, decimals);
    const balance = await provider.getBalance(walletAddress);
    const gasBuffer = this.getGasBuffer(network);

    // Check if user has enough balance for amount + gas buffer
    if (balance < amountBN + gasBuffer) {
      // If not enough balance for both, ensure at least gas buffer is available
      if (amountBN <= gasBuffer) {
        throw new Error(
          `Amount too small. Minimum amount should be greater than ${ethers.formatEther(gasBuffer)} native token to cover gas`,
        );
      }
      // Subtract gas buffer from amount
      const adjustedAmountBN = amountBN - gasBuffer;
      const adjustedAmount = ethers.formatUnits(adjustedAmountBN, decimals);
      console.log(
        '🤖 Adjusted amount for gas buffer:',
        adjustedAmount,
        `(insufficient balance for full amount + ${ethers.formatEther(gasBuffer)} gas)`,
      );
      return adjustedAmount;
    }

    console.log(
      '🤖 Using full amount:',
      amount,
      `(sufficient balance for amount + ${ethers.formatEther(gasBuffer)} gas)`,
    );
    return amount;
  }

  protected async getTokenInfo(tokenAddress: string, network: NetworkName): Promise<Token> {
    this.validateNetwork(network);
    if (this.isSolanaNetwork(network)) {
      // TODO: Implement Solana

      const connection = new Connection(clusterApiUrl('mainnet-beta'));
      const tokenMint = new PublicKey(tokenAddress);
      const tokenInfo = await connection.getParsedAccountInfo(tokenMint);

      if (!tokenInfo.value || !('parsed' in tokenInfo.value.data)) {
        throw new Error(`Invalid token info for ${tokenAddress} on ${network}`);
      }

      const parsedData = tokenInfo.value.data.parsed;
      if (!('info' in parsedData)) {
        throw new Error(`Missing token info for ${tokenAddress}`);
      }

      const { decimals, symbol } = parsedData.info;

      return {
        address: tokenAddress,
        decimals: Number(decimals),
        symbol,
      };
    }
    // For EVM tokens
    const provider = this.getEvmProviderForNetwork(network);
    const erc20Interface = new Interface([
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
    ]);

    const contract = new Contract(tokenAddress, erc20Interface, provider);
    const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);

    return {
      address: tokenAddress.toLowerCase() as `0x${string}`,
      decimals: Number(decimals),
      symbol,
    };
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    this.validateNetwork(network);
    if (this.isSolanaNetwork(network)) {
      console.log('isSolanaNetwork');
      // TODO: Implement Solana
    }
    // Use the tokenCache utility instead of manual caching
    return await this.tokenCache.getToken(tokenAddress, network, this.providers, this.getName());
  }

  async checkBalance(
    quote: BridgeQuote,
    walletAddress: string,
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      this.validateNetwork(quote.fromNetwork);
      if (this.isSolanaNetwork(quote.fromNetwork)) {
        const provider = this.getSolanaProviderForNetwork(quote.fromNetwork);

        const tokenToCheck = quote.fromToken;
        const requiredAmount = BigInt(
          Math.floor(parseFloat(quote.fromAmount) * Math.pow(10, quote.fromToken.decimals)),
        );

        const gasBuffer = this.getGasBuffer(quote.fromNetwork);

        // Check if the token is native SOL
        const isNativeToken = this.isNativeSolana(tokenToCheck.address);

        if (isNativeToken) {
          // For native SOL, just check the wallet balance directly
          const balance = await provider.getBalance(new PublicKey(walletAddress));
          const totalRequired = requiredAmount + gasBuffer;

          if (BigInt(balance) < totalRequired) {
            const formattedBalance = (Number(balance) / Math.pow(10, 9)).toFixed(9);
            const formattedRequired = (Number(requiredAmount) / Math.pow(10, 9)).toFixed(9);
            const formattedTotal = (Number(totalRequired) / Math.pow(10, 9)).toFixed(9);
            return {
              isValid: false,
              message: `Insufficient SOL balance. Required: ${formattedRequired} (+ ~${(Number(gasBuffer) / Math.pow(10, 9)).toFixed(9)} for gas = ${formattedTotal}), Available: ${formattedBalance}`,
            };
          }
          return { isValid: true };
        } else {
          // For SPL tokens
          const tokenAccount = await provider.getParsedTokenAccountsByOwner(
            new PublicKey(walletAddress),
            {
              mint: new PublicKey(quote.fromToken.address),
            },
          );
          if (tokenAccount.value.length === 0) {
            return {
              isValid: false,
              message: `No token account found for ${tokenToCheck.symbol}`,
            };
          }

          const balance = BigInt(tokenAccount.value[0].account.data.parsed.info.tokenAmount.amount);

          if (balance < requiredAmount) {
            const formattedBalance = (
              Number(balance) / Math.pow(10, quote.fromToken.decimals)
            ).toFixed(quote.fromToken.decimals);
            const formattedRequired = (
              Number(requiredAmount) / Math.pow(10, quote.fromToken.decimals)
            ).toFixed(quote.fromToken.decimals);
            return {
              isValid: false,
              message: `Insufficient ${tokenToCheck.symbol} balance. Required: ${formattedRequired} ${tokenToCheck.symbol}, Available: ${formattedBalance} ${tokenToCheck.symbol}`,
            };
          }

          // Check if user has enough SOL for gas
          const nativeBalance = await provider.getBalance(new PublicKey(walletAddress));
          if (BigInt(nativeBalance) < gasBuffer) {
            const formattedBalance = (Number(nativeBalance) / Math.pow(10, 9)).toFixed(9);
            return {
              isValid: false,
              message: `Insufficient SOL for gas fees. Required: ~${(Number(gasBuffer) / Math.pow(10, 9)).toFixed(9)}, Available: ${formattedBalance}`,
            };
          }
        }

        return { isValid: true };
      } else {
        const provider = this.getEvmProviderForNetwork(quote.fromNetwork);
        const tokenToCheck = quote.fromToken;
        const requiredAmount = ethers.parseUnits(quote.fromAmount, quote.fromToken.decimals);
        const gasBuffer = this.getGasBuffer(quote.fromNetwork);

        // Check if the token is native token
        const isNativeToken = this.isNativeToken(tokenToCheck.address);

        if (isNativeToken) {
          const balance = await provider.getBalance(walletAddress);
          const totalRequired = requiredAmount + gasBuffer;

          if (balance < totalRequired) {
            const formattedBalance = ethers.formatEther(balance);
            const formattedRequired = ethers.formatEther(requiredAmount);
            const formattedTotal = ethers.formatEther(totalRequired);
            return {
              isValid: false,
              message: `Insufficient native token balance. Required: ${formattedRequired} (+ ~${ethers.formatEther(gasBuffer)} for gas = ${formattedTotal}), Available: ${formattedBalance}`,
            };
          }
        } else {
          // For other tokens, check ERC20 balance
          const erc20 = new Contract(
            tokenToCheck.address,
            [
              'function balanceOf(address) view returns (uint256)',
              'function symbol() view returns (string)',
            ],
            provider,
          );

          const [balance, symbol] = await Promise.all([
            erc20.balanceOf(walletAddress),
            erc20.symbol(),
          ]);

          if (balance < requiredAmount) {
            const formattedBalance = ethers.formatUnits(balance, quote.fromToken.decimals);
            const formattedRequired = ethers.formatUnits(requiredAmount, quote.fromToken.decimals);
            return {
              isValid: false,
              message: `Insufficient ${symbol} balance. Required: ${formattedRequired} ${symbol}, Available: ${formattedBalance} ${symbol}`,
            };
          }

          // Check if user has enough native token for gas
          const nativeBalance = await provider.getBalance(walletAddress);
          if (nativeBalance < gasBuffer) {
            const formattedBalance = ethers.formatEther(nativeBalance);
            return {
              isValid: false,
              message: `Insufficient native token for gas fees. Required: ~${ethers.formatEther(gasBuffer)}, Available: ${formattedBalance}`,
            };
          }
        }

        return { isValid: true };
      }
    } catch (error) {
      console.error('Error checking balance:', error);
      return {
        isValid: false,
        message: `Failed to check balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  protected storeQuote(quote: BridgeQuote, additionalData?: any) {
    this.quotes.set(quote.quoteId, {
      quote,
      expiresAt: Date.now() + this.QUOTE_EXPIRY,
      ...additionalData,
    });

    setTimeout(() => {
      this.quotes.delete(quote.quoteId);
    }, this.QUOTE_EXPIRY);
  }

  async buildBridgeTransaction(quote: BridgeQuote, walletAddress: string): Promise<Transaction> {
    try {
      this.validateNetwork(quote.fromNetwork);
      const storedData = this.quotes.get(quote.quoteId);
      if (!storedData) {
        throw new Error('Quote expired or not found. Please get a new quote.');
      }

      return {
        to: storedData.quote.tx?.to || '',
        data: storedData.quote.tx?.data || '',
        value: storedData.quote.tx?.value || '0',
        gasLimit: storedData.quote.tx?.gasLimit,
        network: storedData.quote.fromNetwork,
      };
    } catch (error) {
      console.error('Error building bridge transaction:', error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Public method to adjust token amount based on user's balance
   * This can be called directly from the SwapTool to handle precision issues
   *
   * @param tokenAddress The address of the token to adjust
   * @param amount The requested amount
   * @param walletAddress The user's wallet address
   * @param network The blockchain network
   * @returns The adjusted amount that can be safely used
   */
  async adjustAmount(
    tokenAddress: string,
    amount: string,
    walletAddress: string,
    network: NetworkName,
  ): Promise<string> {
    try {
      // Handle edge cases
      if (!amount || amount === '0') return '0';
      if (!tokenAddress || !walletAddress) return amount;

      this.validateNetwork(network);

      // Get token info (including decimals)
      const token = await this.getToken(tokenAddress, network);
      const decimals = token.decimals;

      // Check if it's a native token
      const isNativeToken = this.isNativeToken(tokenAddress);

      if (isNativeToken) {
        // For native tokens, use adjustNativeTokenAmount which handles gas buffer
        return this.adjustNativeTokenAmount(amount, decimals, walletAddress, network);
      } else {
        // For ERC20 tokens, get balance using the cache
        const { formattedBalance } = await this.getTokenBalance(
          tokenAddress,
          walletAddress,
          network,
        );

        // Adjust the amount if needed
        return adjustTokenAmount(amount, formattedBalance, decimals, this.TOLERANCE_PERCENTAGE);
      }
    } catch (error) {
      console.error('Error in adjustAmount:', error);
      // In case of any error, return the original amount
      return amount;
    }
  }

  /**
   * Invalidates the balance cache for a specific token and wallet
   * Useful after transactions that change balances
   *
   * @param tokenAddress The address of the token
   * @param walletAddress The address of the wallet
   * @param network The blockchain network
   */
  invalidateBalanceCache(tokenAddress: string, walletAddress: string, network: NetworkName): void {
    this.balanceCache.invalidateBalance(tokenAddress, walletAddress, network);

    // If it's not a native token, also invalidate the native token balance
    // since gas was likely spent
    if (!this.isNativeToken(tokenAddress)) {
      this.balanceCache.invalidateBalance(EVM_NATIVE_TOKEN_ADDRESS, walletAddress, network);
    }
  }

  /**
   * Sets up periodic cleanup of expired cache entries
   * @private
   */
  private setupCacheCleanup(): void {
    // Clean up expired entries every 5 minutes
    const CLEANUP_INTERVAL = 5 * 60 * 1000;

    setInterval(() => {
      try {
        // Clean up token cache
        this.tokenCache.clearExpiredEntries();

        // Clean up balance cache
        this.balanceCache.clearExpiredEntries();

        // Clean up quotes cache
        const now = Date.now();
        for (const [key, value] of this.quotes.entries()) {
          if (now > value.expiresAt) {
            this.quotes.delete(key);
          }
        }

        console.log(`🧹 Cleaned up expired cache entries for ${this.getName()}`);
      } catch (error) {
        console.error('Error cleaning up caches:', error);
      }
    }, CLEANUP_INTERVAL);
  }
}
