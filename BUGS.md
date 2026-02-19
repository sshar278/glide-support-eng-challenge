# Glide Support Engineer Challenge – Bug Fix Documentation

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

## 1. SEC-303 – XSS Vulnerability in Transaction Description
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

## 2. SEC-301 – SSN Stored in Plaintext
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



##3. SEC-302 – Insecure Account Number Generation
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

## 4. SEC-304 – Multiple Active Sessions Not Invalidated
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


## 5. PERF-406 – Incorrect Balance Calculation (Floating Point Precision)
**Priority:** High (Financial Correctness)

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

## 6. SEC-305 – Hardcoded JWT Secret Fallback
**Priority:** Critical (Authentication Security)

### Reproduction
In `server/routers/auth.ts`, JWT tokens were signed using:

```ts
process.env.JWT_SECRET || "temporary-secret-for-interview"
If the JWT_SECRET environment variable was not set, the application would silently fall back to a hardcoded secret.

Root Cause
The authentication system allowed a predictable fallback secret string:

"temporary-secret-for-interview"
This creates a severe vulnerability:

Attackers can forge valid JWT tokens.

Authentication integrity is compromised.

All user sessions become insecure.

Fix
Removed the fallback entirely and enforced a required environment variable.

At the top of auth.ts:

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not set. Refusing to start server.");
}
JWT signing now strictly uses:

jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: "7d" });
Verification
If JWT_SECRET is missing → server fails to start.

When JWT_SECRET is provided via .env.local, authentication works normally.

No hardcoded fallback remains in codebase.

Prevention
Never use hardcoded secrets.

Fail fast if required environment variables are missing.

Enforce environment validation during application startup.

Add this to BUGS.md:

---


## 7. PERF-401 – fundAccount Returns Incorrect Transaction
**Priority:** High (Correctness)

### Reproduction
1. Fund an account.
2. The API returns a transaction object that does not correspond to the funding action.
3. In `server/routers/account.ts`, the code fetched:
   ```ts
   orderBy(transactions.createdAt).limit(1)


which returns the oldest transaction in the table.

Root Cause

After inserting a new transaction, fundAccount selected the wrong row by querying the global transactions table without filtering by account and ordering ascending.

Fix

Fetch the most recent transaction for the funded account:

.where(eq(transactions.accountId, input.accountId))
.orderBy(desc(transactions.createdAt))
.limit(1)

Verification

After fix, funding an account returns the newly created transaction (matching amount/description).


---

## 8. SEC-306 – Session Cookie Missing Secure Flag
**Priority:** High (Security)

### Reproduction
In `server/routers/auth.ts`, the session cookie was set as:

```ts
session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800
The Secure flag was missing.

Root Cause
Without the Secure attribute, cookies may be transmitted over HTTP, exposing session tokens to interception.

Fix
Conditionally added Secure flag in production:

const isProd = process.env.NODE_ENV === "production";
const cookie = `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${isProd ? "; Secure" : ""}`;
Verification
Application works in development (HTTP).

In production, cookies are marked Secure and sent only over HTTPS.

Prevention
Always use Secure for authentication cookies in production.

Enforce environment-based security configuration.


---

## 9. SEC-307 – Session Cookie Missing Expires Attribute
**Priority:** Medium (Security / Standards Compliance)

### Reproduction
Session cookies were set with `Max-Age=604800` but without an explicit `Expires` attribute.

### Root Cause
The cookie relied solely on `Max-Age`. Some browsers and intermediaries may handle expiration inconsistently when `Expires` is omitted.

### Fix
Added an `Expires` attribute aligned with `Max-Age`:

```ts
const expiresDate = new Date(Date.now() + maxAge * 1000).toUTCString();
Cookie now includes both:

Max-Age=604800;
Expires=<UTC timestamp>
Verification
Cookie now shows both Max-Age and Expires in browser devtools.

Session expiration behavior remains unchanged.

Prevention
Always include both Max-Age and Expires for authentication cookies to ensure cross-browser consistency.


---

## 10. PERF-407 – Performance Degradation (N+1 Queries in getTransactions)
**Priority:** Medium (Performance)

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

## 11. VAL-201 – Email Validation Problems
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

---

## 12. VAL-202 – Date of Birth Validation
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

## 13. VAL-206 – Card Number Validation
**Priority:** Critical

### Reproduction
Funding requests with `fundingSource.type="card"` accepted invalid card numbers (any string / digits).

### Root Cause
`fundingSource.accountNumber` was unvalidated (`z.string()`), and no Luhn/length checks were applied for card funding.

### Fix
Added conditional validation for card funding:
- Strip spaces/hyphens
- Require digits-only and length 13–19
- Validate using Luhn checksum

### Verification
- Valid test card numbers pass (e.g., `4242 4242 4242 4242`)
- Invalid numbers fail with a validation error


---

## 14. VAL-208 – Weak Password Requirements
**Priority:** Critical

### Reproduction
Signup accepted weak passwords that only satisfied minimum length (e.g., `aaaaaaaa`, `password1`).

### Root Cause
Password validation only enforced `min(8)` with no complexity requirements.

### Fix
Strengthened password validation to require:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Verification
- Weak passwords are rejected with clear validation messages
- Strong passwords like `Password1!` are accepted




