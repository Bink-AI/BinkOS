/**
 * Validates an EVM address format
 * @param address The address to validate
 * @returns boolean indicating if the address is valid
 */
export function isValidEVMAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validates a Solana address format
 * @param address The address to validate
 * @returns boolean indicating if the address is valid
 */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * Validates a token address based on the chain type
 * @param address The token address to validate
 * @param chain The blockchain network (e.g., 'solana', 'eth', 'bnb')
 * @returns boolean indicating if the address is valid for the specified chain
 */
export function validateTokenAddress(address: string, chain: string): boolean {
  // Solana chains
  if (chain === 'solana') {
    return isValidSolanaAddress(address);
  }
  // EVM chains (eth, bnb, etc.)
  return isValidEVMAddress(address);
}
