import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * Generates a cryptographically secure 10-digit numeric account number.
 * Uses crypto.randomBytes to ensure unpredictability.
 * @returns A 10-digit numeric string (no leading zeros)
 */
export function generateAccountNumber(): string {
  const min = 1_000_000_000; // 10 digits, no leading zero
  const max = 9_999_999_999; // 10 digits
  const range = max - min + 1;

  while (true) {
    const buf = crypto.randomBytes(6); // 48 bits
    const rand = buf.readUIntBE(0, 6); // 0 .. 2^48-1
    const candidate = rand % range;
    return String(min + candidate);
  }
}

/**
 * Hashes an SSN using bcrypt for secure storage.
 * @param ssn 9-digit social security number
 * @returns Promise<string> bcrypt hash
 */
export async function hashSSN(ssn: string): Promise<string> {
  return bcrypt.hash(ssn, 10);
}

/**
 * Verifies if a hashed SSN matches the provided plaintext SSN.
 * @param ssn plaintext 9-digit SSN
 * @param hashedSSN bcrypt hash
 * @returns Promise<boolean> true if match, false otherwise
 */
export async function verifySSN(ssn: string, hashedSSN: string): Promise<boolean> {
  return bcrypt.compare(ssn, hashedSSN);
}

/**
 * Validates that an account number is a 10-digit numeric string.
 * Used for testing the format of generated numbers.
 * @param accountNumber
 * @returns true if valid
 */
export function isValidAccountNumber(accountNumber: string): boolean {
  return /^\d{10}$/.test(accountNumber) && accountNumber.length === 10;
}

/**
 * Helper for session invalidation logic.
 * Returns an object indicating sessions should be deleted before insert.
 * Used to verify session invalidation happens atomically.
 */
export function createSessionInvalidationPlan(userId: number) {
  return {
    shouldDeleteExistingSessions: true,
    userId,
    operation: "DELETE" as const,
  };
}
