import { ethers } from 'ethers';

/**
 * Default tolerance percentage for handling precision issues
 */
export const DEFAULT_TOLERANCE_PERCENTAGE = 0.01; // 0.01% tolerance

/**
 * Adjusts a token amount to handle precision issues
 * This is useful when comparing amounts with very small differences due to floating point precision
 *
 * @param requestedAmount The amount requested in the transaction
 * @param availableAmount The actual available amount (e.g., from user's balance)
 * @param decimals The token decimals
 * @param tolerancePercentage Optional custom tolerance percentage (defaults to 0.01%)
 * @returns The adjusted amount that can be safely used for the transaction
 */
export function adjustTokenAmount(
  requestedAmount: string,
  availableAmount: string,
  decimals: number,
  tolerancePercentage: number = DEFAULT_TOLERANCE_PERCENTAGE,
): string {
  try {
    // Handle edge cases
    if (!requestedAmount || requestedAmount === '0') return '0';
    if (!availableAmount || availableAmount === '0') return '0';

    // Convert string amounts to BigInt for precise comparison
    const requestedBN = parseTokenAmount(requestedAmount, decimals);
    const availableBN = parseTokenAmount(availableAmount, decimals);

    // If available amount is greater than or equal to requested, no adjustment needed
    if (availableBN >= requestedBN) {
      return requestedAmount;
    }

    // If available amount is zero, return zero
    if (availableBN === BigInt(0)) {
      return '0';
    }

    // Calculate the difference
    const difference = requestedBN - availableBN;

    // If the difference is extremely small (less than 1 wei), use the available amount
    if (difference <= BigInt(1)) {
      console.log(
        `🤖 Amount difference is extremely small (less than 1 wei). Adjusting from ${requestedAmount} to ${availableAmount}`,
      );
      return availableAmount;
    }

    // Calculate percentage difference (multiply by 10000 for precision, then divide by 100 for percentage)
    const percentDifference = Number((difference * BigInt(10000)) / requestedBN) / 100;

    // If the difference is within tolerance, use the available amount
    if (percentDifference <= tolerancePercentage) {
      console.log(
        `🤖 Amount difference is very small (${percentDifference}%). Adjusting from ${requestedAmount} to ${availableAmount}`,
      );
      return availableAmount;
    }

    // If difference is too large, return the original amount (will likely fail with insufficient balance)
    return requestedAmount;
  } catch (error) {
    console.error('Error adjusting token amount:', error);
    // In case of any error, return the original amount
    return requestedAmount;
  }
}

/**
 * Checks if the difference between two amounts is within the acceptable tolerance
 * @param required The required amount
 * @param available The available amount
 * @param tolerancePercentage Optional custom tolerance percentage (defaults to 0.01%)
 * @returns True if the difference is within tolerance, false otherwise
 */
export function isWithinTolerance(
  required: bigint,
  available: bigint,
  tolerancePercentage: number = DEFAULT_TOLERANCE_PERCENTAGE,
): boolean {
  if (available >= required) return true;

  const difference = required - available;
  // Calculate percentage difference (multiply by 10000 for precision, then divide by 100 for percentage)
  const percentDifference = Number((difference * BigInt(10000)) / required) / 100;

  return percentDifference <= tolerancePercentage;
}

/**
 * Formats a token amount with appropriate decimals
 * @param amount The amount as a BigInt
 * @param decimals The token decimals
 * @returns The formatted amount as a string
 */
export function formatTokenAmount(amount: bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

/**
 * Parses a token amount string to BigInt with appropriate decimals
 * @param amount The amount as a string
 * @param decimals The token decimals
 * @returns The parsed amount as a BigInt
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  try {
    // Handle edge cases
    if (!amount || amount === '0') return BigInt(0);

    // Check if the amount has more decimal places than allowed
    const parts = amount.split('.');
    if (parts.length === 2 && parts[1].length > decimals) {
      // Truncate the excess decimal places
      const truncatedAmount = `${parts[0]}.${parts[1].substring(0, decimals)}`;
      return ethers.parseUnits(truncatedAmount, decimals);
    }

    // Normal case - use ethers.parseUnits directly
    return ethers.parseUnits(amount, decimals);
  } catch (error) {
    console.error('Error parsing token amount:', error);
    // In case of any error, return zero
    return BigInt(0);
  }
}
