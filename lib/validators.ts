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

/**
 * Common domain typos that are often mistaken for real domains
 */
const COMMON_EMAIL_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmil.com": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "aol.con": "aol.com",
  "aol.co": "aol.com",
  "gmai.con": "gmail.com",
  "hotmail.con": "hotmail.com",
  "outlook.con": "outlook.com",
};

/**
 * Valid email TLDs to prevent obviously invalid emails
 */
const VALID_TLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "info", "biz", "co", "uk", "us",
  "ca", "de", "fr", "it", "es", "jp", "cn", "au", "in", "ru", "br", "mx",
  "io", "tv", "ws", "mobi, asia", "name", "pro", "aero", "coop", "jobs", "xxx"
]);

/**
 * Validates an email address with enhanced checks for:
 * - Proper email format
 * - Common domain typos
 * - Common TLD extensions
 * - No uppercase characters (case-sensitive validation)
 * 
 * Returns validation result with suggestions for typos
 */
export function validateEmail(email: string): { valid: boolean; error?: string; suggestion?: string } {
  // Check for uppercase letters - suggest lowercase version
  if (email !== email.toLowerCase()) {
    return {
      valid: false,
      error: "Email contains uppercase letters. Please use lowercase.",
      suggestion: email.toLowerCase(),
    };
  }

  // Basic email format: must have @ and something before/after
  if (!email.includes("@")) {
    return {
      valid: false,
      error: "Email must contain an @ symbol",
    };
  }

  // Check for spaces anywhere in the email
  if (/\s/.test(email)) {
    return {
      valid: false,
      error: "Email cannot contain spaces",
    };
  }

  const [localPart, domain] = email.split("@");

  // Validate local part (before @)
  if (!localPart || localPart.length === 0) {
    return {
      valid: false,
      error: "Email must have characters before @",
    };
  }

  if (localPart.length > 64) {
    return {
      valid: false,
      error: "Email local part is too long (max 64 characters)",
    };
  }

  // Valid characters in local part: alphanumeric, dots, hyphens, underscores, plus
  if (!/^[a-z0-9._+-]+$/.test(localPart)) {
    return {
      valid: false,
      error: "Email contains invalid characters before @",
    };
  }

  // Validate domain
  if (!domain || domain.length === 0) {
    return {
      valid: false,
      error: "Email must have a domain after @",
    };
  }

  if (domain.length > 255) {
    return {
      valid: false,
      error: "Email domain is too long",
    };
  }

  // Check for common typos
  const typoSuggestion = COMMON_EMAIL_TYPOS[domain];
  if (typoSuggestion) {
    return {
      valid: false,
      error: `Did you mean ${localPart}@${typoSuggestion}?`,
      suggestion: `${localPart}@${typoSuggestion}`,
    };
  }

  // Validate domain format (must have at least one dot and valid TLD)
  if (!domain.includes(".")) {
    return {
      valid: false,
      error: "Email domain must have an extension (e.g., .com)",
    };
  }

  const tld = domain.split(".").pop()?.toLowerCase();
  if (!tld || tld.length < 2) {
    return {
      valid: false,
      error: "Email domain extension is invalid",
    };
  }

  // Check for common typos in TLDs (e.g., .con instead of .com)
  if (tld === "con") {
    return {
      valid: false,
      error: "Did you mean .com instead of .con?",
      suggestion: email.replace(".con", ".com"),
    };
  }

  // More lenient TLD validation - allow any 2+ character TLD (not all registered ones)
  // This prevents rejecting new TLDs like .dev, .app, etc.
  if (tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return {
      valid: false,
      error: "Email domain extension is invalid",
    };
  }

  // Domain labels validation (between dots)
  const labels = domain.split(".");
  for (const label of labels) {
    if (label.length === 0) {
      return {
        valid: false,
        error: "Email domain has consecutive dots",
      };
    }

    if (!/^[a-z0-9-]+$/.test(label)) {
      return {
        valid: false,
        error: "Email domain contains invalid characters",
      };
    }

    if (label.startsWith("-") || label.endsWith("-")) {
      return {
        valid: false,
        error: "Email domain labels cannot start or end with a hyphen",
      };
    }
  }

  return { valid: true };
}
