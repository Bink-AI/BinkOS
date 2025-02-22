import { ethers } from 'ethers';
import {
  Keypair,
  Transaction as SolanaTransaction,
  VersionedTransaction,
  Connection,
  sendAndConfirmTransaction,
  sendAndConfirmRawTransaction,
} from '@solana/web3.js';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { Network } from '../network';
import { NetworkName } from '../network/types';
import {
  WalletConfig,
  SignMessageParams,
  SignTransactionParams,
  TransactionType,
  IWallet,
  TransactionRequest,
  TransactionReceipt,
} from './types';

export class Wallet implements IWallet {
  readonly #evmWallet: ethers.HDNodeWallet;
  readonly #solanaKeypair: Keypair;
  readonly #network: Network;

  constructor(config: WalletConfig, network: Network) {
    this.#network = network;

    // Initialize EVM wallet
    this.#evmWallet = ethers.Wallet.fromPhrase(config.seedPhrase);

    // Initialize Solana wallet
    const seed = mnemonicToSeedSync(config.seedPhrase);
    const derivedPath = `m/44'/501'/${config.index ?? 0}'/0'`;
    const keyPair = derivePath(derivedPath, seed.toString('hex'));
    this.#solanaKeypair = Keypair.fromSeed(keyPair.key);
  }

  public async getAddress(network: NetworkName): Promise<string> {
    const networkType = this.#network.getNetworkType(network);

    if (networkType === 'evm') {
      return this.#evmWallet.address;
    } else {
      return this.#solanaKeypair.publicKey.toString();
    }
  }

  public async signMessage(params: SignMessageParams): Promise<string> {
    const networkType = this.#network.getNetworkType(params.network);

    if (networkType === 'evm') {
      return await this.#evmWallet.signMessage(params.message);
    } else {
      const messageBytes = new TextEncoder().encode(params.message);
      const signature = nacl.sign.detached(messageBytes, this.#solanaKeypair.secretKey);
      return bs58.encode(signature);
    }
  }

  public async signTransaction(params: SignTransactionParams): Promise<string> {
    const networkType = this.#network.getNetworkType(params.network);
    const transaction = params.transaction as TransactionType;

    if (networkType === 'evm') {
      const evmTx = transaction as ethers.Transaction;
      return await this.#evmWallet.signTransaction(evmTx);
    } else {
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([this.#solanaKeypair]);
        return Buffer.from(transaction.serialize()).toString('base64');
      } else if (transaction instanceof SolanaTransaction) {
        transaction.partialSign(this.#solanaKeypair);
        return Buffer.from(transaction.serialize()).toString('base64');
      }
      throw new Error('Invalid Solana transaction type');
    }
  }

  public getPublicKey(network: NetworkName): string {
    const networkType = this.#network.getNetworkType(network);

    if (networkType === 'evm') {
      return this.#evmWallet.publicKey;
    } else {
      return this.#solanaKeypair.publicKey.toBase58();
    }
  }

  public getPrivateKey(network: NetworkName): string {
    const networkType = this.#network.getNetworkType(network);

    if (networkType === 'evm') {
      return this.#evmWallet.privateKey;
    } else {
      return bs58.encode(this.#solanaKeypair.secretKey.slice(0, 32));
    }
  }

  public async sendTransaction(
    network: NetworkName,
    transaction: TransactionRequest,
  ): Promise<TransactionReceipt> {
    const networkType = this.#network.getNetworkType(network);
    const networkConfig = this.#network.getConfig(network);

    if (networkType === 'evm') {
      const provider = new ethers.JsonRpcProvider(networkConfig.config.rpcUrl);
      const signer = this.#evmWallet.connect(provider);

      const tx = await signer.sendTransaction({
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
        gasLimit: transaction.gasLimit,
      });

      const receipt = await tx.wait();
      if (!receipt) throw new Error('Transaction failed');

      return {
        hash: tx.hash,
        wait: async () => {
          const finalReceipt = await tx.wait();
          if (!finalReceipt) throw new Error('Transaction failed');
          return {
            hash: finalReceipt.hash,
            wait: async () => ({
              hash: finalReceipt.hash,
              wait: async () => {
                throw new Error('Already waited');
              },
            }),
          };
        },
      };
    } else {
      const connection = new Connection(networkConfig.config.rpcUrl);

      // Try to parse as VersionedTransaction first
      try {
        const tx = VersionedTransaction.deserialize(Buffer.from(transaction.data, 'base64'));
        // Sign the transaction
        tx.sign([this.#solanaKeypair]);

        // Send and confirm transaction
        const signature = await connection.sendTransaction(tx);

        return {
          hash: signature,
          wait: async () => {
            await connection.confirmTransaction(signature);
            return {
              hash: signature,
              wait: async () => ({
                hash: signature,
                wait: async () => {
                  throw new Error('Already waited');
                },
              }),
            };
          },
        };
      } catch (e) {
        // If not a VersionedTransaction, try as regular Transaction
        const tx = SolanaTransaction.from(Buffer.from(transaction.data, 'base64'));

        // Sign the transaction
        tx.partialSign(this.#solanaKeypair);

        // Send and confirm transaction
        const signature = await connection.sendTransaction(tx, [this.#solanaKeypair]);

        return {
          hash: signature,
          wait: async () => {
            await connection.confirmTransaction(signature);
            return {
              hash: signature,
              wait: async () => ({
                hash: signature,
                wait: async () => {
                  throw new Error('Already waited');
                },
              }),
            };
          },
        };
      }
    }
  }

  public async signAndSendTransaction(
    network: NetworkName,
    transaction: TransactionRequest,
  ): Promise<TransactionReceipt> {
    const networkType = this.#network.getNetworkType(network);
    const networkConfig = this.#network.getConfig(network);

    if (networkType === 'evm') {
      const provider = new ethers.JsonRpcProvider(networkConfig.config.rpcUrl);
      const signer = this.#evmWallet.connect(provider);

      // Create and sign transaction
      const tx = await signer.populateTransaction({
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
        gasLimit: transaction.gasLimit,
      });
      const signedTx = await signer.signTransaction(tx);

      // Send signed transaction
      const sentTx = await provider.broadcastTransaction(signedTx);
      const receipt = await sentTx.wait();
      if (!receipt) throw new Error('Transaction failed');

      return {
        hash: sentTx.hash,
        wait: async () => {
          const finalReceipt = await sentTx.wait();
          if (!finalReceipt) throw new Error('Transaction failed');
          return {
            hash: finalReceipt.hash,
            wait: async () => ({
              hash: finalReceipt.hash,
              wait: async () => {
                throw new Error('Already waited');
              },
            }),
          };
        },
      };
    } else {
      const connection = new Connection(networkConfig.config.rpcUrl);

      // Try to parse as VersionedTransaction first
      try {
        let tx = VersionedTransaction.deserialize(Buffer.from(transaction.data, 'base64'));

        // Sign transaction
        tx.sign([this.#solanaKeypair]);

        // Send raw transaction
        const rawTransaction = Buffer.from(tx.serialize());
        const signature = await connection.sendRawTransaction(rawTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        return {
          hash: signature,
          wait: async () => {
            await connection.confirmTransaction(signature);
            return {
              hash: signature,
              wait: async () => ({
                hash: signature,
                wait: async () => {
                  throw new Error('Already waited');
                },
              }),
            };
          },
        };
      } catch (e) {
        console.log('🚀 ~ Wallet ~ signAndSendTransactionSolana ~ error:', e);

        // If not a VersionedTransaction, try as regular Transaction
        const tx = SolanaTransaction.from(Buffer.from(transaction.data, 'base64'));

        // Sign transaction
        tx.sign(this.#solanaKeypair);

        // Send raw transaction
        const rawTransaction = tx.serialize();
        const signature = await connection.sendRawTransaction(rawTransaction, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        return {
          hash: signature,
          wait: async () => {
            await connection.confirmTransaction(signature);
            return {
              hash: signature,
              wait: async () => ({
                hash: signature,
                wait: async () => {
                  throw new Error('Already waited');
                },
              }),
            };
          },
        };
      }
    }
  }
}
