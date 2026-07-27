// app/login/actions.ts
"use server";

import { db } from "../lib/db";
import bcrypt from "bcryptjs";
import { createSession } from "../lib/session";

// Any valid bcrypt hash — used to keep timing consistent when no user is
// found, so response time can't be used to enumerate valid emails.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q2wZ6Xh2ZzT7YXBzHUAo1n3ZDMDe.";

export async function authenticateUser(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { success: false, error: "Please provide all required credentials." };
  }

  if (password.length > 128) {
    return { success: false, error: "Invalid email or password combination." };
  }

  try {
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    const isPasswordValid = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_HASH
    );

    if (!user || !isPasswordValid) {
      return { success: false, error: "Invalid email or password combination." };
    }

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