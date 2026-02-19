# Glide Support Engineer Challenge – Bug Fix Documentation
# Note : All the existing fixed code is currently on the main branch only. You should be able to run from there
---

## UI-101 – Dark Mode Text Visibility (Input Fields)
**Priority:** Medium (UI/UX)

### Reproduction Steps
1. Enable dark mode on the browser (Settings > Display > Dark Mode)
2. Navigate to signup, login, or funding pages
3. Try typing in any input field
4. Text input appears white on white background, invisible

### Root Cause
Input elements throughout the application lacked Tailwind dark mode variants:
- No `dark:bg-gray-800` for background in dark mode
- No `dark:text-white` for text color in dark mode
- No `dark:border-gray-600` for border styling in dark mode

The inputs used only light mode classes like `border-gray-300` and `bg-white`, which in dark mode resulted in white text on white background.

### Fix
Added comprehensive dark mode support using Tailwind's `dark:` variants to all input elements:

```tsx
// Before:
className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"

// After:
className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
```

Applied dark mode support to:
- **Forms:** Signup page (all steps), Login page
- **Modals:** AccountCreationModal, FundingModal
- **Input types:** text, email, password, tel, date
- **Modal backgrounds:** Added `dark:bg-gray-800` to modal containers
- **Labels:** Added `dark:text-gray-300` to form labels

### Verification
✅ All input fields now have dark background in dark mode  
✅ Text is white on dark background, clearly visible  
✅ Borders use darker gray shade for contrast  
✅ Placeholders are visible in dark mode  
✅ Modal containers have dark background  
✅ Labels are readable in dark mode

### Prevention
- Always include dark mode variants when building forms
- Use Tailwind's `dark:` prefix for all interactive elements
- Test dark mode during development, not just at end
- Include these dark mode classes in default form component styles

---

---

## VAL-201 – Email Validation Problems
**Priority:** High (Data Quality & UX)

### Reproduction
1. Signup with `TEST@example.com` (uppercase letters) → silently accepted and lowercased
2. Signup with `user@gmai.com` (typo) → incorrectly accepted
3. Signup with `user@example.con` (TLD typo) → incorrectly accepted
4. No validation error shown for uppercase emails

### Root Cause
**Frontend:** Email validation used overly permissive regex `/^\S+@\S+$/i` which accepts anything with an @ symbol (no domain extension check).

**Backend:** Zod schema used `.email().toLowerCase()` which validated the email correctly but silently converted uppercase to lowercase without user notification.

**Missing:** No detection for common domain typos (`.gmial.com` → `.gmail.com`) or TLD typos (`.con` → `.com`).

### Fix
Created comprehensive `validateEmail()` utility in `lib/validators.ts` with:

1. **Uppercase detection:** Rejects uppercase letters and suggests lowercase version
   ```ts
   if (email !== email.toLowerCase()) {
     return {
       valid: false,
       error: "Email contains uppercase letters. Please use lowercase.",
       suggestion: email.toLowerCase(),
     };
   }
   ```

2. **Common domain typo detection:** Maps known typos to correct domains
   ```ts
   const typos = {
     "gmai.com": "gmail.com",
     "gmial.com": "gmail.com",
     "hotmial.com": "hotmail.com",
     "yahooo.com": "yahoo.com",
     "aol.con": "aol.com",
   };
   ```

3. **TLD typo detection:** Catches `.con` → `.com` mistakes
   ```ts
   if (tld === "con") {
     suggestion: email.replace(".con", ".com");
   }
   ```

4. **Format validation:** Strict character validation for local part and domain labels

**Applied to:**
- `app/signup/page.tsx` - Step 1 email input with suggestion UI
- `app/login/page.tsx` - Email input with suggestion acceptance button
- `server/routers/auth.ts` - Both signup and login endpoints use `validateEmail()` in Zod schema

**Frontend UX Improvement:**
Users see a clickable suggestion button: "Use suggested email: test@example.com" when typos are detected.

### Verification
✅ Uppercase emails rejected with suggestion (TEST@example.com → test@example.com)  
✅ Common domain typos detected (gmai.com → gmail.com, hotmial.com → hotmail.com)  
✅ TLD typos detected (.con → .com)  
✅ Valid emails accepted (user@example.com, john.doe@company.org, name+tag@domain.co.uk)  
✅ No silent lowercasing - users see explicit error messages  
✅ Suggestion UI provides quick fix button on frontend  
✅ 44 comprehensive unit tests covering all scenarios  

### Prevention
- Always validate email format with proper domain/TLD checks
- Never silently transform user input (lowercase, trim, etc.) without notification
- Include common typo detection especially for popular email providers
- Provide actionable suggestions when validation fails
- Test both frontend pattern validation and backend schema validation


## VAL-202 – Date of Birth Validation
**Priority:** Critical

### Reproduction
During signup, entering a future birth year (e.g., `2025-01-01`) is accepted.

### Root Cause
`dateOfBirth` was defined as `z.string()` with no validation, allowing future dates and underage signups.

### Fix
Added validation to ensure:
- DOB is a valid date string
- DOB is not in the future
- User is at least 18 years old

### Verification
- `2025-01-01` → rejected
- Under-18 DOB → rejected
- Valid adult DOB → accepted


---


# VAL-205 – Zero Amount Funding
**Priority:** High (Data Quality)

### Reproduction
1. Open the funding modal
2. Enter amount `0.00` or `0`
3. Submit the funding request
4. Zero-dollar transaction is created in the account

### Root Cause
**Frontend:** FundingModal validation used `min: { value: 0.0 }` which allowed zero amounts, despite error message saying "at least $0.01".

**Backend:** While `z.number().positive()` is correct, the validation error message was not explicit about rejecting zero amounts.

### Fix
**Frontend Changes in `components/FundingModal.tsx`:**
Replaced min/max validators with custom validators that explicitly check amount > 0:
```tsx
validate: {
  positive: (value) => {
    const amount = parseFloat(value);
    return amount > 0 || "Amount must be greater than $0.00";
  },
  maxAmount: (value) => {
    const amount = parseFloat(value);
    return amount <= 10000 || "Amount cannot exceed $10,000";
  },
}
```

**Backend Changes in `server/routers/account.ts`:**
Enhanced error message for clarity:
```ts
amount: z.number().positive("Amount must be greater than $0.00"),
```

### Verification
✅ Zero amounts (0.00, 0) are rejected with clear error  
✅ Negative amounts are rejected  
✅ Positive amounts > $0.00 are accepted  
✅ Amount limit ($10,000 max) is enforced  
✅ Frontend and backend validation are synchronized  
✅ 14 comprehensive unit tests covering all zero/boundary scenarios  

### Prevention
- Use custom validators for business logic (> 0 for funding amounts)
- Never use min/max on currency without explicit validation
- Ensure error messages match actual validation rules
- Validate both frontend and backend with same rules
- Add tests for boundary conditions (0, negative, max)

---

## VAL-206 – Card Number Validation
**Priority:** Critical

### Reproduction
1. Open funding modal and select "Credit/Debit Card"
2. Enter an invalid card number (e.g., `1234567890123456`)
3. Submit the funding request
4. Invalid card is accepted and transaction is processed

### Root Cause
**Frontend:** FundingModal only validated card format as exactly 16 digits starting with 4 or 5—rejected valid Amex cards (15 digits) and other valid lengths.

**Backend:** While `fundingSource.accountNumber` had basic format validation, it lacked:
- Proper length range support (13-19 digits not just 16)
- Luhn algorithm verification for checksum validation
- No stripping of spaces/hyphens before validation

### Fix

**Backend Implementation in `server/routers/account.ts`:**

Added `isValidLuhn()` function and enhanced card validation:
```ts
function isValidLuhn(cardNumber: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    const digit = Number(cardNumber[i]);
    let add = digit;
    if (shouldDouble) {
      add = digit * 2;
      if (add > 9) add -= 9;
    }
    sum += add;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}
```

Added `.superRefine()` validation in Zod schema:
```ts
.superRefine((fs, ctx) => {
  if (fs.type === "card") {
    const digitsOnly = fs.accountNumber.replace(/\s|-/g, "");
    if (!/^\d{13,19}$/.test(digitsOnly)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid card number format",
        path: ["accountNumber"],
      });
      return;
    }
    if (!isValidLuhn(digitsOnly)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid card number",
        path: ["accountNumber"],
      });
    }
  }
})
```

**Frontend Enhancement in `components/FundingModal.tsx`:**

- Added `isValidLuhn()` function for client-side validation
- Replaced restrictive 16-digit check with 13-19 digit range
- Added Luhn validation in custom validators
- Removed "must start with 4 or 5" restriction (backend validates the actual type)
- Added space/hyphen stripping
- Improved error messages

```tsx
validate: {
  cardFormat: (value) => {
    const digitsOnly = value.replace(/\s|-/g, "");
    if (!/^\d{13,19}$/.test(digitsOnly)) {
      return "Card number must be 13-19 digits";
    }
    return true;
  },
  cardLuhn: (value) => {
    const digitsOnly = value.replace(/\s|-/g, "");
    if (!/^\d{13,19}$/.test(digitsOnly)) return true;
    return isValidLuhn(digitsOnly) || "Invalid card number (failed validation)";
  },
}
```

### Verification
✅ Valid Visa cards (16 digits) pass validation  
✅ Valid Mastercard (16 digits) passes validation  
✅ Valid American Express (15 digits) passes validation  
✅ Card numbers with spaces/hyphens accepted and validated  
✅ Invalid Luhn checksums rejected  
✅ Incorrect lengths (< 13 or > 19 digits) rejected  
✅ Non-digit characters rejected (except spaces/hyphens)  
✅ 20 comprehensive unit tests covering all scenarios  
✅ Backend and frontend validation synchronized  

### Prevention
- Always validate card numbers with Luhn algorithm (not just format)
- Support international card lengths (13-19 digits, not just 16)
- Allow flexibility in input format (spaces, hyphens) but validate normalized version
- Don't make assumptions about card type from first digit
- Add both client-side (UX) and server-side (security) validation
- Include boundary/edge case tests for format validation

---

## VAL-207 – Routing Number Required for Bank Transfers
**Priority:** High (Financial Correctness & Compliance)

### Reproduction
1. Open Funding modal and select "Bank Account"
2. Leave routing number blank or enter less/more than 9 digits
3. Submit the funding request
4. The backend accepted the request and processed the transaction without a valid routing number

### Root Cause
The backend `fundAccount` input validation did not enforce the presence and exact 9-digit format for `routingNumber` when `fundingSource.type === "bank"`. The frontend was also missing a synchronized required/format validation in some earlier iterations.

### Fix
- Backend (`server/routers/account.ts`): added `.superRefine()` logic to require `routingNumber` for bank transfers and to enforce a 9-digit numeric pattern. Emits a clear Zod issue: "Routing number is required and must be 9 digits".
- Frontend (`components/FundingModal.tsx`): register `routingNumber` as required when `fundingType === "bank"` and validate against `/^\d{9}$/` with clear error messages.

### Verification
✅ Backend rejects missing or malformed routing numbers for bank funding
✅ Frontend shows immediate validation errors when routing number is omitted or incorrect
✅ Tests added to `tests/bugfixes.test.ts` to assert both backend code contains the validation and the frontend registers the required pattern

### Prevention
- Always enforce bank routing numbers as required for ACH-style transfers
- Use exact 9-digit numeric validation for US routing numbers at input and schema level
- Keep frontend and backend validation messages aligned and descriptive
- Add unit tests for validation presence and format



## VAL-208 – Weak Password Requirements
**Priority:** Critical

### Reproduction
1. Navigate to signup page
2. Try to create account with password like `diego1234` (lowercase + numbers only)
3. **Issue**: Frontend accepted the password without showing complexity errors, even though backend would reject it

### Root Cause
**Frontend and Backend Mismatch**: 
- **Backend (server/routers/auth.ts)**: Had proper password complexity validation requiring uppercase, lowercase, number, and special character
- **Frontend (app/signup/page.tsx)**: Only validated minimum length (8 chars) and that password contains a number, missing checks for:
  - Uppercase letter requirement
  - Lowercase letter requirement
  - Special character requirement

This caused users to see validation errors only after submitting the form (server-side error), instead of getting real-time feedback during typing.

### Fix
Updated frontend validation in `app/signup/page.tsx` to match backend requirements:

```tsx
// Before:
validate: {
  notCommon: (value) => {
    const commonPasswords = ["password", "12345678", "qwerty"];
    return !commonPasswords.includes(value.toLowerCase()) || "Password is too common";
  },
  hasNumber: (value) => /\d/.test(value) || "Password must contain a number",
}

// After:
validate: {
  hasLowercase: (value) => /[a-z]/.test(value) || "Password must include a lowercase letter",
  hasUppercase: (value) => /[A-Z]/.test(value) || "Password must include an uppercase letter",
  hasNumber: (value) => /\d/.test(value) || "Password must include a number",
  hasSpecial: (value) => /[^A-Za-z0-9]/.test(value) || "Password must include a special character",
}
```

### Verification
✅ Backend validation enforces all complexity requirements (auth.ts):
- `.min(8, "Password must be at least 8 characters")`
- `.regex(/[a-z]/, "Password must include a lowercase letter")`
- `.regex(/[A-Z]/, "Password must include an uppercase letter")`
- `.regex(/\d/, "Password must include a number")`
- `.regex(/[^A-Za-z0-9]/, "Password must include a special character")`

✅ Frontend now shows real-time validation errors matching backend rules

✅ Weak passwords are rejected with specific error messages:
- `diego1234` → "Password must include an uppercase letter" + "Password must include a special character"
- `Password123` → "Password must include a special character"

✅ Strong passwords like `Password1!` are accepted

✅ 13 comprehensive tests added to verify all password complexity rules


## PERF-401 – Account Creation Error Handling
**Priority:** Critical

### Reproduction
1. Create a new checking or savings account
2. If the database retrieval fails after insertion, the system would show a $100 balance
3. However, the actual account in the database would have $0

### Root Cause
In `server/routers/account.ts`, the `createAccount` mutation had a dangerous fallback pattern:

```typescript
return (
  account || {
    id: 0,
    userId: ctx.user.id,
    accountNumber: accountNumber!,
    accountType: input.accountType,
    balance: 100,  // ← BUG: Hardcoded fallback balance!
    status: "pending",
    createdAt: new Date().toISOString(),
  }
);
```

**The Issue:**
1. Account is inserted into database with `balance: 0`
2. System tries to fetch the created account from the database
3. If the fetch operation fails (connection error, DB issue, etc.), the account variable is `null`
4. The `||` operator triggers the fallback object with `balance: 100`
5. **UI shows $100 balance, but the account in the database has $0**
6. This creates a discrepancy and confusion

### Fix
Remove the dangerous fallback object. If the account cannot be retrieved, throw an error:

```typescript
await db.insert(accounts).values({
  userId: ctx.user.id,
  accountNumber: accountNumber!,
  accountType: input.accountType,
  balance: 0,
  status: "active",
});

// Fetch the created account
const account = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber!)).get();

if (!account) {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Failed to create account: unable to retrieve account after creation",
  });
}

return account;
```

**Key Changes:**
- ✅ Removed the fallback object with `balance: 100`
- ✅ Account status is set to `"active"` (not `"pending"`)
- ✅ If retrieval fails, throw an explicit error instead of returning incorrect data
- ✅ Ensures UI will show an error rather than a wrong balance

### Verification
✅ All newly created accounts start with $0 balance (not $100)
✅ Account status is `"active"` (not `"pending"`)
✅ If database retrieval fails, user gets an error message instead of incorrect data
✅ No silent failure that shows wrong balance
✅ 6 comprehensive tests added to verify error handling and balance correctness

### Prevention
- Always verify database operations succeeded before returning data to the client
- Avoid fallback objects with hardcoded/incorrect values
- Use explicit error handling instead of silently returning wrong data
- Test database failure scenarios to ensure proper error propagation


## SEC-301 – SSN Stored in Plaintext
**Priority:** Critical (Security)

### Reproduction
1. Sign up with SSN `111223333`.
2. Run:
   ```bash
   node -e 'const Database=require("better-sqlite3"); const db=new Database("bank.db"); console.log(db.prepare("select id,email,ssn from users order by id desc limit 3").all());'

Observe SSN stored as raw value (e.g., 111223333).

Root Cause

In server/routers/auth.ts, the entire input object (including ssn) was inserted directly into the database:

await db.insert(users).values({
  ...input,
  password: hashedPassword,
});


This caused SSNs to be stored in plaintext.

Fix

Hash the SSN before storing:

const hashedSSN = await bcrypt.hash(input.ssn, 10);

await db.insert(users).values({
  ...input,
  password: hashedPassword,
  ssn: hashedSSN,
});

Verification

After fix, querying the database shows SSN stored as a bcrypt hash:

$2b$10$...

---



## SEC-302 – Insecure Account Number Generation
**Priority:** Critical (Security)

### Reproduction
1. Inspect `server/routers/account.ts`.
2. Observe account numbers generated using:
   ```ts
   Math.random()
Math.random() is not cryptographically secure and is predictable.

Root Cause
The function generateAccountNumber() used:

Math.floor(Math.random() * 1000000000)
Math.random() is not suitable for generating financial identifiers because it is:

Predictable

Not cryptographically secure

Vulnerable to statistical attacks

Fix
Replaced Math.random() with Node's crypto.randomBytes() to generate
a cryptographically secure random 10-digit numeric account number:

import crypto from "crypto";

function generateAccountNumber(): string {
  const min = 1_000_000_000;
  const max = 9_999_999_999;
  const range = max - min + 1;

  const buf = crypto.randomBytes(6);
  const rand = buf.readUIntBE(0, 6);
  const candidate = rand % range;

  return String(min + candidate);
}
Verification
After fix:

New accounts generate 10-digit numeric account numbers

No usage of Math.random() remains in account generation

Prevention
Security-sensitive identifiers must use cryptographically secure randomness.
Always prefer:

crypto.randomBytes() (Node)

crypto.getRandomValues() (browser)


---


## SEC-303 – XSS Vulnerability in Transaction Description
**Priority:** Critical (Security)

### Reproduction Steps
1. Insert malicious transaction:
   `<img src=x onerror=alert("XSS")>`
2. Refresh dashboard.
3. Alert popup appears.

### Root Cause
`components/TransactionList.tsx` used:
`dangerouslySetInnerHTML` to render `transaction.description`.

This allows arbitrary HTML and JavaScript execution.

### Fix
Replaced:
`dangerouslySetInnerHTML`
with plain React text rendering:

```tsx
{transaction.description ?? "-"}


---


## SEC-304 – Multiple Active Sessions Not Invalidated
**Priority:** Critical (Security)

### Reproduction
1. Log in as a user in a normal window.
2. Log in as the same user in an incognito/private window.
3. Run:
   ```bash
   npm run db:list-sessions
Observe multiple ACTIVE sessions for the same user.

Root Cause
In server/routers/auth.ts, both signup and login create a new session token but do not invalidate existing sessions for the user, allowing multiple valid sessions simultaneously.

Fix
Before inserting a new session, delete existing sessions for the user:

await db.delete(sessions).where(eq(sessions.userId, user.id));
Applied in both signup and login.

Verification
After fix, repeating the reproduction steps results in only one ACTIVE session per user in db:list-sessions.

Prevention
Enforce a clear session policy (single-session vs multi-session)

If multi-session is desired, require device metadata + session revocation UI

Always support server-side session invalidation


---








## PERF-406 – Incorrect Balance Calculation (Floating Point Precision)
**Priority:** Critical (Financial Correctness)

### Reproduction
1. Fund an account with a decimal amount (e.g., `0.1` or `0.2`).
2. Observe the returned `newBalance` value.
3. Notice slight inconsistencies due to floating point accumulation.

### Root Cause
In `server/routers/account.ts` inside the `fundAccount` mutation, the returned balance was calculated using repeated floating point addition:

```ts
let finalBalance = account.balance;
for (let i = 0; i < 100; i++) {
  finalBalance = finalBalance + amount / 100;
}
This introduced unnecessary floating point precision errors and returned a value different from what was actually written to the database.

Fix
Removed the floating accumulation loop and returned the exact value written to the database:

const newBalance = account.balance + amount;

return {
  transaction,
  newBalance,
};
Verification
After fix:

Funding with decimal values (e.g., 0.1, 0.2) produces consistent and predictable balances.

The returned balance matches the stored database value.

Prevention
Avoid repeated floating arithmetic for financial values.

Always return the exact persisted value.

Consider using integer cents or a decimal library for production-grade financial systems.


---


## PERF-405 – Missing Transactions in History
**Priority:** Critical

### Reproduction
1. Create multiple funding transactions rapidly (within same second)
2. View transaction history
3. **Issue**: Some transactions appear to be missing from the history even though they were created successfully

### Root Cause
The `getTransactions` query had two main issues:

**Issue 1: No Ordering**
```typescript
const accountTransactions = await db
  .select()
  .from(transactions)
  .where(eq(transactions.accountId, input.accountId));
  // ← Missing .orderBy() - results can be in any order!
```

When multiple transactions are created rapidly with the same or similar `createdAt` timestamps, the database query returns results in unpredictable order. With unstable ordering, transactions might not be consistently visible or might appear/disappear depending on the query execution.

**Issue 2: No Timestamp Consistency**
In `fundAccount`, transactions were inserted without explicitly setting `createdAt`, relying on the database default. This can cause:
- Multiple transactions with identical timestamps (especially when created in quick succession)
- No way to break ties and consistently order transactions
- Lost transactions when ordering is unstable

### Fix
Three key changes:

**1. Explicit createdAt in fundAccount:**
```typescript
const transactionCreatedAt = new Date().toISOString();
await db.insert(transactions).values({
  accountId: input.accountId,
  type: "deposit",
  amount,
  description: `Funding from ${input.fundingSource.type}`,
  status: "completed",
  createdAt: transactionCreatedAt,  // ← Explicit timestamp
  processedAt: new Date().toISOString(),
});
```

**2. Proper ordering with tiebreaker in getTransactions:**
```typescript
const accountTransactions = await db
  .select()
  .from(transactions)
  .where(eq(transactions.accountId, input.accountId))
  .orderBy(desc(transactions.createdAt), desc(transactions.id));  // ← NEW: Consistent ordering
```

The `desc(transactions.id)` acts as a tiebreaker when multiple transactions have the same `createdAt` timestamp, ensuring deterministic ordering.

**3. Consistent ordering in fundAccount response:**
```typescript
const transaction = await db
  .select()
  .from(transactions)
  .where(eq(transactions.accountId, input.accountId))
  .orderBy(desc(transactions.createdAt), desc(transactions.id))  // ← Same ordering
  .limit(1)
  .get();
```

### Verification
✅ Transactions are consistently ordered by `createdAt DESC`
✅ When timestamps tie, transactions are ordered by `id DESC` (secondary sort)
✅ All transactions appear in history (none missing)
✅ Transaction order is stable across multiple queries
✅ Even rapid consecutive transactions are all visible
✅ 8 comprehensive tests added to verify ordering and consistency

### Prevention
- Always use explicit timestamps for time-series data
- Always order queries when order matters for user experience
- Use secondary sort keys (like ID) to break ties when timestamps are equal
- Test rapid/bulk creation scenarios to catch missing data issues

---

## PERF-407 – Performance Degradation (N+1 Queries in getTransactions)
**Priority:** High (Performance)

### Reproduction
In `server/routers/account.ts` under `getTransactions`, the code queried account details once per transaction:

```ts
for (const transaction of accountTransactions) {
  await db.select().from(accounts).where(eq(accounts.id, transaction.accountId)).get();
}
This results in N+1 database queries (1 for transactions + N for accounts).

Root Cause
Account details were fetched repeatedly inside a loop even though all transactions belong to the same accountId.

Fix
Fetch the account once and enrich transactions in memory:

const accountDetails = await db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();

return accountTransactions.map((transaction) => ({
  ...transaction,
  accountType: accountDetails?.accountType,
}));
Verification
Transaction list renders correctly and the number of DB queries is reduced from N+1 to a constant number (2).

Prevention
Avoid per-row queries inside loops. Prefer joins or fetching shared reference data once.

---

## PERF-408 – Resource Leak (Database connections remain open)
**Priority:** Critical

### Root Cause
`lib/db/index.ts` created extra SQLite connections inside `initDb()` and stored them in a `connections[]` array without ever closing them. In dev / hot reload scenarios, this can accumulate open DB handles.

### Fix
- Removed the unused per-init `new Database(dbPath)` connection creation and `connections[]` tracking.
- Converted SQLite initialization to a singleton (via `globalThis`) to prevent multiple connections being created during Next.js dev reloads.

### Verification
Restarted the app and confirmed DB operations still work normally, with no repeated connection creation during reload.

