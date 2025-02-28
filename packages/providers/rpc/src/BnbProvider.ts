import {
  IWalletProvider,
  Transaction,
  TransferParams,
  TransferQuote,
  WalletBalance,
  WalletInfo,
} from '@binkai/wallet-plugin';
import { Contract, ethers, Interface } from 'ethers';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';

interface BnbProviderConfig {
  rpcUrl?: string;
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];
const CONSTANTS = {
  QUOTE_EXPIRY: 10 * 60 * 1000, // 10 minutes in milliseconds
} as const;

export class BnbProvider implements IWalletProvider {
  private provider: ethers.JsonRpcProvider;
  protected quotes: Map<string, { quote: TransferQuote; expiresAt: number }>;

  constructor(config: BnbProviderConfig) {
    this.provider = new ethers.JsonRpcProvider(
      config.rpcUrl || 'https://bsc-dataseed1.binance.org',
    );
    this.quotes = new Map();
  }

  getName(): string {
    return 'bnb';
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB];
  }

  async getWalletInfo(address: string): Promise<WalletInfo> {
    const nativeBalance = await this.getNativeBalance(address);
    return {
      address,
      nativeBalance: nativeBalance,
      tokens: undefined,
      //   totalUsdValue,
    };
  }

  async getNativeBalance(address: string): Promise<WalletBalance> {
    const balance = await this.provider.getBalance(address);
    return {
      symbol: 'BNB',
      balance: ethers.formatUnits(balance, 18),
      decimals: 18,
      //   usdValue: 0, // Implement price fetching logic
    };
  }

  async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<WalletBalance> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol(),
    ]);

    return {
      symbol,
      balance: balance.toString(),
      decimals,
      tokenAddress: tokenAddress,
      //   usdValue: 0, // Implement price fetching logic
    };
  }

  async getQuote(params: TransferParams, walletAddress: string): Promise<TransferQuote> {
    this.validateNetwork(params.network);

    // Get token information
    const token = await this.getToken(params.token);

    // Generate a unique quote ID
    const quoteId = ethers.hexlify(ethers.randomBytes(32));

    // Estimate gas for the transaction
    let estimatedGas = '21000'; // Default for native token transfers

    if (!this.isNativeToken(params.token)) {
      estimatedGas = '65000'; // Default for ERC20 transfers
    }

    // Create the quote
    const quote: TransferQuote = {
      network: params.network,
      quoteId,
      token,
      fromAddress: walletAddress,
      toAddress: params.toAddress,
      amount: params.amount,
      estimatedGas,
    };

    // Store the quote with expiry (10 minutes)
    this.quotes.set(quoteId, {
      quote,
      expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY,
    });

    return quote;
  }

  async buildTransferTransaction(
    quote: TransferQuote,
    walletAddress: string,
  ): Promise<Transaction> {
    this.validateNetwork(quote.network);

    // Verify the quote exists and is valid
    const storedQuote = this.quotes.get(quote.quoteId);
    if (!storedQuote || storedQuote.expiresAt < Date.now()) {
      throw new Error('Quote expired or invalid');
    }

    // Verify the sender matches
    if (quote.fromAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Quote sender does not match wallet address');
    }

    const tokenAddress = quote.token.address;

    if (this.isNativeToken(tokenAddress)) {
      // Native token transfer
      return {
        to: quote.toAddress,
        data: '0x',
        value: ethers.parseUnits(quote.amount, quote.token.decimals).toString(),
        gasLimit: ethers.parseUnits(quote.estimatedGas, 'wei'),
        network: quote.network,
      };
    } else {
      // ERC20 token transfer
      const erc20Interface = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)',
      ]);

      const data = erc20Interface.encodeFunctionData('transfer', [
        quote.toAddress,
        ethers.parseUnits(quote.amount, quote.token.decimals),
      ]);

      return {
        to: tokenAddress,
        data,
        value: '0',
        gasLimit: ethers.parseUnits(quote.estimatedGas, 'wei'),
        network: quote.network,
      };
    }
  }

  protected validateNetwork(network: NetworkName): void {
    if (!this.getSupportedNetworks().includes(network)) {
      throw new Error(`Network ${network} is not supported by ${this.getName()}`);
    }
  }

  isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string): Promise<Token> {
    // Handle native token
    if (this.isNativeToken(tokenAddress)) {
      return {
        address: tokenAddress as `0x${string}`,
        decimals: 18,
        symbol: 'BNB',
      };
    }
    // For ERC20 tokens
    const erc20Interface = new Interface([
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
    ]);
    const contract = new Contract(tokenAddress, erc20Interface, this.provider);
    const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);
    return {
      address: tokenAddress.toLowerCase() as `0x${string}`,
      decimals: Number(decimals),
      symbol,
    };
  }

  async checkBalance(
    quote: TransferQuote,
    walletAddress: string,
  ): Promise<{ isValid: boolean; message?: string }> {
    this.validateNetwork(quote.network);
    const provider = this.provider;
    const tokenAddress = quote.token.address;

    try {
      let balance: bigint;
      if (this.isNativeToken(tokenAddress)) {
        // Check native token balance
        balance = await provider.getBalance(walletAddress);
      } else {
        // Check ERC20 token balance
        const erc20Interface = new Interface([
          'function balanceOf(address owner) view returns (uint256)',
        ]);
        const contract = new Contract(tokenAddress, erc20Interface, provider);
        balance = await contract.balanceOf(walletAddress);
      }

      // Parse the required amount using the token's decimals
      const requiredAmount = ethers.parseUnits(quote.amount, quote.token.decimals);

      // Check if we need to account for gas costs for native token transfers
      let effectiveBalance = balance;
      if (this.isNativeToken(tokenAddress)) {
        // For native token transfers, we need to ensure there's enough for the transfer amount plus gas
        const gasLimit = ethers.parseUnits(quote.estimatedGas, 'wei');
        effectiveBalance = balance - gasLimit;
        if (effectiveBalance < 0n) effectiveBalance = 0n;
      }

      if (effectiveBalance < requiredAmount) {
        return {
          isValid: false,
          message: `Insufficient balance. Required: ${quote.amount} ${quote.token.symbol}, Available: ${ethers.formatUnits(balance, quote.token.decimals)} ${quote.token.symbol}${
            this.isNativeToken(tokenAddress) ? ' (gas costs will be deducted)' : ''
          }`,
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        message: `Error checking balance: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async buildApproveTransaction(
    network: NetworkName,
    tokenAddress: string,
    spender: string,
    amount: string,
  ): Promise<Transaction> {
    this.validateNetwork(network);
    if (this.isNativeToken(tokenAddress)) {
      throw new Error('Native token does not need approval');
    }

    const tokenInfo = await this.getToken(tokenAddress);
    const erc20Interface = new Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    const data = erc20Interface.encodeFunctionData('approve', [
      spender,
      ethers.parseUnits(amount, tokenInfo.decimals),
    ]);

    return {
      to: tokenAddress,
      data,
      value: '0',
      network,
    };
  }

  async checkAllowance(
    network: NetworkName,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<bigint> {
    this.validateNetwork(network);
    if (this.isNativeToken(tokenAddress)) {
      // Native tokens don't need allowance
      return ethers.MaxUint256;
    }

    const provider = this.provider;
    const erc20Interface = new Interface([
      'function allowance(address owner, address spender) view returns (uint256)',
    ]);

    const contract = new Contract(tokenAddress, erc20Interface, provider);
    return await contract.allowance(owner, spender);
  }
}
