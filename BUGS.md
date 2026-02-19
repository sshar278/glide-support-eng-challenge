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





