"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { sendMail } from "../lib/mail";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

export interface RequestResetState {
  done: boolean;
  error?: string;
}

/**
 * Step 1 — request a reset link. Always returns the same generic "sent"
 * result whether or not the email exists, so it can't be used to enumerate
 * accounts. Any real failure is logged server-side only.
 */
export async function requestPasswordReset(
  _prev: RequestResetState,
  formData: FormData,
): Promise<RequestResetState> {
  const email = String(formData.get("email") || "").toLowerCase().trim();
  if (!email || !email.includes("@")) {
    return { done: false, error: "Enter a valid email address." };
  }

  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      await db.password_reset_tokens.create({
        data: {
          id: crypto.randomUUID(),
          subjectType: "user",
          subjectId: user.id,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        },
      });

      const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
      const link = `${base}/reset-password?token=${rawToken}`;

      await sendMail({
        to: user.email,
        subject: "Reset your Ankrah F&L password",
        bodyHtml: `
          <p>Hi ${escapeHtml(user.name)},</p>
          <p>We received a request to reset your password. This link expires in <strong>1 hour</strong> and can be used once.</p>
          <p style="text-align:center;margin:26px 0;">
            <a href="${link}" style="display:inline-block;background:#2e63af;color:#ffffff;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:bold;">Reset password</a>
          </p>
          <p style="font-size:0.85rem;color:#94a3b8;">If the button doesn't work, paste this link into your browser:<br>${link}</p>
          <p style="font-size:0.85rem;color:#94a3b8;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      });
    }
  } catch (err) {
    console.error("requestPasswordReset failed:", err);
  }

  // Generic result regardless of outcome.
  return { done: true };
}

export interface ResetState {
  success: boolean;
  error?: string;
}

/**
 * Step 2 — set a new password using the token from the emailed link.
 */
export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!token) return { success: false, error: "This reset link is invalid." };
  if (password.length < 8)
    return { success: false, error: "Password must be at least 8 characters." };
  if (password.length > 128)
    return { success: false, error: "Password is too long." };
  if (password !== confirm)
    return { success: false, error: "Passwords do not match." };

  try {
    const row = await db.password_reset_tokens.findFirst({
      where: {
        tokenHash: sha256(token),
        subjectType: "user",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) {
      return { success: false, error: "This reset link is invalid or has expired." };
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.$transaction([
      db.user.update({ where: { id: row.subjectId }, data: { password: hashed } }),
      db.password_reset_tokens.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { success: true };
  } catch (err) {
    console.error("resetPassword failed:", err);
    return { success: false, error: "Could not reset your password. Please try again." };
  }
}
