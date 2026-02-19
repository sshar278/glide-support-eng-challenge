import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";


const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not set. Refusing to start server.");
}

/**
 * Builds session cookie string with conditional Secure flag for production.
 * @param token Session token value
 * @param maxAge Max-Age in seconds (omit or 0 for logout)
 */
function buildSessionCookie(token: string, maxAge: number = 604800): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const expiresDate = new Date(Date.now() + maxAge * 1000).toUTCString();
  return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Expires=${expiresDate}${secure}`;
}

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email().toLowerCase(),
        password: z.string().min(8),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phoneNumber: z.string().regex(/^\+?\d{10,15}$/),
        dateOfBirth: z.string(),
        ssn: z.string().regex(/^\d{9}$/),
        address: z.string().min(1),
        city: z.string().min(1),
        state: z.string().length(2).toUpperCase(),
        zipCode: z.string().regex(/^\d{5}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existingUser = await db.select().from(users).where(eq(users.email, input.email)).get();

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);
      const hashedSSN = await bcrypt.hash(input.ssn, 10);

      await db.insert(users).values({
      ...input,
      password: hashedPassword,
      ssn: hashedSSN,
      });


      // Fetch the created user
      const user = await db.select().from(users).where(eq(users.email, input.email)).get();

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Invalidate existing sessions for this user
      await db.delete(sessions).where(eq(sessions.userId, user.id));


      // Create session
     const token = jwt.sign(
  { userId: user.id },
  jwtSecret,
  { expiresIn: "7d" }
);


      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      // Set cookie
      const cookie = buildSessionCookie(token);
      if ("setHeader" in ctx.res) {
        ctx.res.setHeader("Set-Cookie", cookie);
      } else {
        (ctx.res as Headers).set("Set-Cookie", cookie);
      }

      return { user: { ...user, password: undefined }, token };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.select().from(users).where(eq(users.email, input.email)).get();

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const validPassword = await bcrypt.compare(input.password, user.password);

      if (!validPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      // Invalidate existing sessions for this user
      await db.delete(sessions).where(eq(sessions.userId, user.id));

      const token = jwt.sign(
  { userId: user.id },
  jwtSecret,
  { expiresIn: "7d" }
);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      if ("setHeader" in ctx.res) {
        const cookie = buildSessionCookie(token);
        ctx.res.setHeader("Set-Cookie", cookie);
      } else {
        const cookie = buildSessionCookie(token);
        (ctx.res as Headers).set("Set-Cookie", cookie);
      }

      return { user: { ...user, password: undefined }, token };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) {
      // Delete session from database
      let token: string | undefined;
      if ("cookies" in ctx.req) {
        token = (ctx.req as any).cookies.session;
      } else {
        const cookieHeader = ctx.req.headers.get?.("cookie") || (ctx.req.headers as any).cookie;
        token = cookieHeader
          ?.split("; ")
          .find((c: string) => c.startsWith("session="))
          ?.split("=")[1];
      }
      if (token) {
        await db.delete(sessions).where(eq(sessions.token, token));
      }
    }

    if ("setHeader" in ctx.res) {
      const cookie = buildSessionCookie("", 0);
      ctx.res.setHeader("Set-Cookie", cookie);
    } else {
      const cookie = buildSessionCookie("", 0);
      (ctx.res as Headers).set("Set-Cookie", cookie);
    }

    return { success: true, message: ctx.user ? "Logged out successfully" : "No active session" };
  }),
});
