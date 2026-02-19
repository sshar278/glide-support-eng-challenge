import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { generateAccountNumber } from "@/lib/validators";

function isValidLuhn(cardNumber: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let i = cardNumber.length - 1; i >= 0; i--) {
    const digit = Number(cardNumber[i]);
    if (Number.isNaN(digit)) return false;

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


export const accountRouter = router({
  createAccount: protectedProcedure
    .input(
      z.object({
        accountType: z.enum(["checking", "savings"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user already has an account of this type
      const existingAccount = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)))
        .get();

      if (existingAccount) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a ${input.accountType} account`,
        });
      }

      let accountNumber;
      let isUnique = false;

      // Generate unique account number
      while (!isUnique) {
        accountNumber = generateAccountNumber();
        const existing = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber)).get();
        isUnique = !existing;
      }

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
    }),

  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, ctx.user.id));

    return userAccounts;
  }),

  fundAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().positive("Amount must be greater than $0.00"),
        fundingSource: z
  .object({
    type: z.enum(["card", "bank"]),
    accountNumber: z.string(),
    routingNumber: z.string().optional(),
  })
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
    // Bank transfers must include a valid 9-digit routing number
    if (fs.type === "bank") {
      if (!fs.routingNumber || !/^\d{9}$/.test(fs.routingNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Routing number is required and must be 9 digits",
          path: ["routingNumber"],
        });
        return;
      }
    }
  }),

      })
    )
    .mutation(async ({ input, ctx }) => {
      const amount = parseFloat(input.amount.toString());

      // Verify account belongs to user
      const account = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .get();

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      if (account.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account is not active",
        });
      }

      // Create transaction with explicit createdAt to ensure it's always set
      const transactionCreatedAt = new Date().toISOString();
      await db.insert(transactions).values({
        accountId: input.accountId,
        type: "deposit",
        amount,
        description: `Funding from ${input.fundingSource.type}`,
        status: "completed",
        createdAt: transactionCreatedAt,
        processedAt: new Date().toISOString(),
      });

      // Fetch the created transaction - order by createdAt DESC to ensure we get the latest one
      const transaction = await db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, input.accountId))
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(1)
      .get();

      // Update account balance
      await db
        .update(accounts)
        .set({
          balance: account.balance + amount,
        })
        .where(eq(accounts.id, input.accountId));

      const newBalance = account.balance + amount;

      return {
        transaction,
        newBalance,
      };
      }),

  getTransactions: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify account belongs to user
      const account = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .get();

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      // Fetch transactions ordered by createdAt DESC (newest first), with ID as tiebreaker for consistent ordering
      const accountTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, input.accountId))
        .orderBy(desc(transactions.createdAt), desc(transactions.id));

      const accountDetails = await db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();

      return accountTransactions.map((transaction) => ({
      ...transaction,
      accountType: accountDetails?.accountType, 
      }));

    }),
});
