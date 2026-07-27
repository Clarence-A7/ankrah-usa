"use server";

import { db } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";
import {
  sendComposedEmail,
  htmlIsEmpty,
  readPdfAttachment,
  type EmailComposeState,
} from "@/app/lib/email-compose";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

type UserRoleValue =
  | "super_admin"
  | "origin_admin"
  | "destination_admin"
  | "o_driver"
  | "d_driver";

const ASSIGNABLE_ROLES: readonly UserRoleValue[] = [
  "super_admin",
  "origin_admin",
  "destination_admin",
  "o_driver",
  "d_driver",
];

const ALL_STAFF_ROLES: UserRoleValue[] = [
  "super_admin",
  "origin_admin",
  "destination_admin",
  "o_driver",
  "d_driver",
];

// Recipient groups for staff broadcasts.
const STAFF_GROUPS: Record<string, UserRoleValue[]> = {
  all: ALL_STAFF_ROLES,
  drivers: ["o_driver", "d_driver"],
  origin: ["origin_admin", "o_driver"],
  destination: ["destination_admin", "d_driver"],
};

export interface UpdatedStaffResult {
  id: string;
  name: string;
  email: string;
  role: string;
  staffId: string | null;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

/**
 * Generates an internal identifier matching your specific naming convention rules.
 * Format Blueprint: A[3-Digits][MMYY][Role]
 * Example Output: A7420626OD (for an o_driver registered in June 2026)
 */
async function generateUniqueStaffId(role: string): Promise<string> {
  let roleSuffix = "STF";
  if (role === "o_driver") roleSuffix = "OD";
  else if (role === "d_driver") roleSuffix = "DD";
  else if (role === "origin_admin") roleSuffix = "OA";
  else if (role === "destination_admin") roleSuffix = "DA";
  else if (role === "super_admin") roleSuffix = "SA";

  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  const dateStamp = `${month}${year}`;

  let isUnique = false;
  let finalStaffId = "";
  let attempts = 0;

  while (!isUnique && attempts < 20) {
    attempts++;
    const randomDigits = Math.floor(100 + Math.random() * 900).toString();
    finalStaffId = `A${randomDigits}${dateStamp}${roleSuffix}`;

    const existingId = await db.user.findUnique({
      where: { staffId: finalStaffId },
    });

    if (!existingId) {
      isUnique = true;
    }
  }

  return finalStaffId;
}

/* ------------------------------- createUser ------------------------------ */

export async function createUser(prevState: any, formData: FormData) {
  // --- Authorization gate ---------------------------------------------
  // Any caller reaching this Server Action directly (not just someone
  // using the intended form) must be authenticated and role-checked here.
  // Do not remove this, and do not rely on hiding the "Add Staff" button
  // client-side as a substitute — that's UI convenience, not access control.
  const session = await getSession();

  if (!session?.userId) {
    return { success: false, error: "You must be signed in to do this." };
  }

  if (session.role !== "origin_admin" && session.role !== "super_admin") {
    return {
      success: false,
      error: "You don't have permission to create users.",
    };
  }

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const role = formData.get("role") as string;
  const avatarUrl = formData.get("avatarUrl") as string | null;

  if (!name || !email || !password || !role) {
    return {
      success: false,
      error: "All profile fields are explicitly required.",
    };
  }

  if (!ASSIGNABLE_ROLES.includes(role as UserRoleValue)) {
    return { success: false, error: "That role isn't valid." };
  }

  // Only an existing super_admin may mint another super_admin account.
  if (role === "super_admin" && session.role !== "super_admin") {
    return {
      success: false,
      error: "Only a super admin can create another super admin account.",
    };
  }

  if (password.length < 8) {
    return {
      success: false,
      error: "Password must be at least 8 characters.",
    };
  }

  // Defense in depth — the client already resizes/compresses before
  // sending this, but never trust client-side enforcement alone.
  if (avatarUrl) {
    if (!avatarUrl.startsWith("data:image/")) {
      return { success: false, error: "Invalid avatar image." };
    }
    if (avatarUrl.length > 2_000_000) {
      return { success: false, error: "Avatar image is too large." };
    }
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return {
        success: false,
        error: "A terminal user with this email registry already exists.",
      };
    }

    const generatedStaffId = await generateUniqueStaffId(role);
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: role as UserRoleValue,
        staffId: generatedStaffId,
        avatarUrl: avatarUrl || null,
      },
    });

    revalidatePath("/dashboard/admins/users");

    return {
      success: true,
      message: `Successfully registered ${name}! ID assigned: ${generatedStaffId}`,
    };
  } catch (error) {
    console.error("Database write failure during user insertion:", error);
    return {
      success: false,
      error: "An internal server fault blocked account instantiation.",
    };
  }
}

/* ------------------------------- updateUser ------------------------------ */

export async function updateUser(prevState: any, formData: FormData) {
  const session = await getSession();

  if (!session?.userId) {
    return { success: false, error: "You must be signed in to do this." };
  }

  if (session.role !== "origin_admin" && session.role !== "super_admin") {
    return {
      success: false,
      error: "You don't have permission to edit users.",
    };
  }

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as string;
  const phone = (formData.get("phone") as string) || "";
  const address = (formData.get("address") as string) || "";
  const password = (formData.get("password") as string) || "";
  const avatarUrl = formData.get("avatarUrl") as string | null;
  const removeAvatar = formData.get("removeAvatar") === "true";

  if (!id || !name || !email || !role) {
    return { success: false, error: "Name, email, and role are required." };
  }

  if (!ASSIGNABLE_ROLES.includes(role as UserRoleValue)) {
    return { success: false, error: "That role isn't valid." };
  }

  const target = await db.user.findUnique({ where: { id } });
  if (!target) {
    return { success: false, error: "That user no longer exists." };
  }

  // A super_admin account can only be touched by another super_admin —
  // stops a lower-privileged admin from tampering with a higher one's
  // email/phone as a precursor to account takeover.
  if (target.role === "super_admin" && session.role !== "super_admin") {
    return {
      success: false,
      error: "Only a super admin can edit another super admin.",
    };
  }

  if (role === "super_admin" && session.role !== "super_admin") {
    return {
      success: false,
      error: "Only a super admin can assign the super admin role.",
    };
  }

  if (password && password.length < 8) {
    return {
      success: false,
      error: "Password must be at least 8 characters.",
    };
  }

  if (avatarUrl) {
    if (!avatarUrl.startsWith("data:image/")) {
      return { success: false, error: "Invalid avatar image." };
    }
    if (avatarUrl.length > 2_000_000) {
      return { success: false, error: "Avatar image is too large." };
    }
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const emailOwner = await db.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (emailOwner && emailOwner.id !== id) {
      return {
        success: false,
        error: "Another user already has this email.",
      };
    }

    const data: Record<string, unknown> = {
      name: name.trim(),
      email: normalizedEmail,
      role: role as UserRoleValue,
      phone: phone.trim() || null,
      address: address.trim() || null,
    };

    if (password) {
      data.password = await bcrypt.hash(password, 10);
    }

    if (removeAvatar) {
      data.avatarUrl = null;
    } else if (avatarUrl) {
      data.avatarUrl = avatarUrl;
    }

    const updated = await db.user.update({
      where: { id },
      data,
    });

    revalidatePath("/dashboard/admins/users");

    const user: UpdatedStaffResult = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      staffId: updated.staffId,
      phone: updated.phone,
      address: updated.address,
      avatarUrl: updated.avatarUrl,
      createdAt: updated.createdAt.toISOString(),
    };

    return {
      success: true,
      message: `${updated.name} updated successfully.`,
      user,
    };
  } catch (error) {
    console.error("Database write failure during user update:", error);
    return {
      success: false,
      error: "An internal server fault blocked the update.",
    };
  }
}

/* ------------------------------- emailStaff ------------------------------ */

/**
 * Email staff — a recipient group (BCC broadcast) or one individually.
 * Groups: all | drivers | origin | destination.
 * - super_admin / origin_admin: any group / any staff member.
 * - destination_admin: destination staff only (clamped server-side).
 * Body is rich HTML (with inline images) plus an optional PDF attachment.
 */
export async function emailStaff(
  _prev: EmailComposeState,
  formData: FormData,
): Promise<EmailComposeState> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "You must be signed in to do this." };
  }

  const role = session.role;
  const canEmail =
    role === "super_admin" || role === "origin_admin" || role === "destination_admin";
  if (!canEmail) {
    return { success: false, error: "You don't have permission to email staff." };
  }

  const mode = String(formData.get("mode") || "group"); // "group" | "individual"
  const group = String(formData.get("group") || "all");
  const targetId = String(formData.get("targetId") || "");
  const subject = String(formData.get("subject") || "").trim();
  const html = String(formData.get("html") || "");
  const pdf = readPdfAttachment(formData);

  if (!subject) return { success: false, error: "Subject is required." };
  if (subject.length > 200) return { success: false, error: "Subject is too long." };
  if (htmlIsEmpty(html)) return { success: false, error: "Message body is required." };
  if (html.length > 5_000_000) return { success: false, error: "Message is too large." };

  // Destination admins are clamped to destination staff regardless of group.
  const scopeRoles: UserRoleValue[] =
    role === "destination_admin" ? ["destination_admin", "d_driver"] : ALL_STAFF_ROLES;

  let recipients: { name: string; email: string }[];
  try {
    if (mode === "individual") {
      if (!targetId) return { success: false, error: "No recipient selected." };
      const u = await db.user.findFirst({
        where: { id: targetId, role: { in: scopeRoles } },
        select: { name: true, email: true },
      });
      if (!u) {
        return { success: false, error: "That staff member isn't in your scope." };
      }
      recipients = [u];
    } else {
      const groupRoles = (STAFF_GROUPS[group] || ALL_STAFF_ROLES).filter((r) =>
        scopeRoles.includes(r),
      );
      recipients = await db.user.findMany({
        where: { role: { in: groupRoles }, id: { not: session.userId } },
        select: { name: true, email: true },
      });
    }
  } catch (e) {
    console.error("emailStaff recipient lookup failed:", e);
    return { success: false, error: "Could not load recipients." };
  }

  const emails = [...new Set(recipients.map((r) => r.email).filter(Boolean))];
  if (emails.length === 0) {
    return { success: false, error: "No recipients in that group." };
  }

  const sender = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  });

  try {
    await sendComposedEmail({
      recipients: emails,
      individual: mode === "individual",
      subject,
      html,
      pdf,
      senderName: sender?.name || "Admin",
    });
  } catch (e) {
    console.error("emailStaff send failed:", e);
    const msg =
      e instanceof Error && e.message.includes("10MB")
        ? e.message
        : "Email could not be sent. Please try again.";
    return { success: false, error: msg };
  }

  return {
    success: true,
    message:
      mode === "individual"
        ? `Email sent to ${recipients[0].name}.`
        : `Email sent to ${emails.length} recipient${emails.length === 1 ? "" : "s"}.`,
  };
}