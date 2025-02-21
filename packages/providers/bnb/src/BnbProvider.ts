import { IWalletProvider, WalletBalance, WalletInfo } from '@binkai/wallet-plugin';
import { ethers } from 'ethers';

interface BnbProviderConfig {
  rpcUrl?: string;
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class BnbProvider implements IWalletProvider {
  private provider: ethers.JsonRpcProvider;

  constructor(config: BnbProviderConfig) {
    this.provider = new ethers.JsonRpcProvider(
      config.rpcUrl || 'https://bsc-dataseed1.binance.org',
    );
  }

  getName(): string {
    return 'bnb';
  }

  getSupportedChains(): string[] {
    return ['bnb'];
  }

  async getWalletInfo(address: string, chain: string): Promise<WalletInfo> {
    const nativeBalance = await this.getNativeBalance(address, chain);
    const tokens = await this.getTokenBalances(address, chain);

    // const totalUsdValue = tokens.reduce((sum, token) => {
    //   return sum + (token.usdValue || 0);
    // }, nativeBalance.usdValue || 0);

    return {
      address,
      nativeBalance,
      tokens,
      //   totalUsdValue,
    };
  }

  async getNativeBalance(address: string, chain: string): Promise<WalletBalance> {
    const balance = await this.provider.getBalance(address);
    return {
      symbol: 'BNB',
      balance: ethers.formatUnits(balance, 18),
      decimals: 18,
      //   usdValue: 0, // Implement price fetching logic
    };
  }

  async getTokenBalances(address: string, chain: string): Promise<WalletBalance[]> {
    // This would typically call the BSCScan API to get token list
    // For demo, returning empty array
    // Implement BSCScan API integration for full functionality
    return [];
  }

  async getTransactionCount(address: string, chain: string): Promise<number> {
    return await this.provider.getTransactionCount(address);
  }

  private async getTokenBalance(
    tokenAddress: string,
    walletAddress: string,
  ): Promise<WalletBalance> {
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
      address: tokenAddress,
      //   usdValue: 0, // Implement price fetching logic
    };
  }
}
