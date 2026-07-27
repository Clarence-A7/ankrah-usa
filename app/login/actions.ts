// app/login/actions.ts
"use server";

import { headers } from "next/headers";
import { db } from "../lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "../lib/session";
import { rateLimitWithSweep, resetRateLimit } from "../lib/rate-limit";

// Any valid bcrypt hash — used to keep timing consistent when no user is
// found, so response time can't be used to enumerate valid emails.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q2wZ6Xh2ZzT7YXBzHUAo1n3ZDMDe.";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_PER_EMAIL = 8; // targeted brute force against one account
const MAX_PER_IP = 40; // credential spraying across many accounts

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function authenticateUser(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "Please provide all required credentials." };
  }

  if (password.length > 128) {
    return { success: false, error: "Invalid email or password combination." };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const ip = await clientIp();
  const emailKey = `login:email:${ip}:${normalizedEmail}`;
  const ipKey = `login:ip:${ip}`;

  // Throttle before touching the DB / bcrypt. Same generic message either way
  // so a locked-out attacker can't distinguish "wrong password" from "blocked".
  const emailLimit = rateLimitWithSweep(emailKey, MAX_PER_EMAIL, WINDOW_MS);
  const ipLimit = rateLimitWithSweep(ipKey, MAX_PER_IP, WINDOW_MS);
  if (emailLimit.limited || ipLimit.limited) {
    return {
      success: false,
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  try {
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    const isPasswordValid = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_HASH
    );

    if (!user || !isPasswordValid) {
      return { success: false, error: "Invalid email or password combination." };
    }

    // Successful login — clear this account's counter so a legitimate user who
    // fumbled a few times isn't left throttled.
    resetRateLimit(emailKey);

    await createSession(user.id, user.email, user.role, user.staffId);

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
      },
    };
  } catch (error) {
    console.error("Database connection fault during authentication:", error);
    return { success: false, error: "An internal server error occurred." };
  }
}