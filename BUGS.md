# Glide Support Engineer Challenge – Bug Fix Documentation

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





# Glide Support Engineer Challenge – Bug Fix Documentation

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

## SEC-305 – Hardcoded JWT Secret Fallback
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

## PERF-401 – fundAccount Returns Incorrect Transaction
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

## SEC-306 – Session Cookie Missing Secure Flag
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

## SEC-307 – Session Cookie Missing Expires Attribute
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


