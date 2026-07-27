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

export interface UpdatedCustomerResult {
  id: string;
  customerCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function updateCustomer(prevState: any, formData: FormData) {
  const session = await getSession();

  if (!session?.userId) {
    return { success: false, error: "You must be signed in to do this." };
  }

  if (session.role !== "origin_admin" && session.role !== "super_admin") {
    return {
      success: false,
      error: "You don't have permission to edit customers.",
    };
  }

  const id = formData.get("id") as string;
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const streetAddress = (formData.get("streetAddress") as string) || "";
  const city = (formData.get("city") as string) || "";
  const state = (formData.get("state") as string) || "";
  const zipCode = (formData.get("zipCode") as string) || "";
  const isActive = formData.get("isActive") === "true";
  const password = (formData.get("password") as string) || "";

  if (!id || !firstName || !lastName || !email || !phone) {
    return { success: false, error: "Name, email, and phone are required." };
  }

  if (password && password.length < 8) {
    return {
      success: false,
      error: "Password must be at least 8 characters.",
    };
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const emailOwner = await db.customers.findUnique({
      where: { email: normalizedEmail },
    });
    if (emailOwner && emailOwner.id !== id) {
      return {
        success: false,
        error: "Another customer already has this email.",
      };
    }

    const data: Record<string, unknown> = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      streetAddress: streetAddress.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      zipCode: zipCode.trim() || null,
      isActive,
    };

    // Admin-initiated reset for a locked-out customer — unlike self-service
    // settings, this doesn't require the customer's current password since
    // the caller is already an authenticated staff member handling support.
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await db.customers.update({ where: { id }, data });

    revalidatePath("/dashboard/customers");

    const customer: UpdatedCustomerResult = {
      id: updated.id,
      customerCode: updated.customerCode,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      streetAddress: updated.streetAddress,
      city: updated.city,
      state: updated.state,
      zipCode: updated.zipCode,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    };

    return {
      success: true,
      message: `${updated.firstName} ${updated.lastName} updated.`,
      customer,
    };
  } catch (error) {
    console.error("Database write failure during customer update:", error);
    return {
      success: false,
      error: "An internal server fault blocked the update.",
    };
  }
}

/* ----------------------------- emailCustomers ---------------------------- */

/**
 * Email customers — all active customers (BCC broadcast) or one individually.
 * super_admin / origin_admin only. Rich HTML body + optional PDF attachment.
 */
export async function emailCustomers(
  _prev: EmailComposeState,
  formData: FormData,
): Promise<EmailComposeState> {
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "You must be signed in to do this." };
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    return { success: false, error: "You don't have permission to email customers." };
  }

  const mode = String(formData.get("mode") || "group"); // "group" (all) | "individual"
  const targetId = String(formData.get("targetId") || "");
  const subject = String(formData.get("subject") || "").trim();
  const html = String(formData.get("html") || "");
  const pdf = readPdfAttachment(formData);

  if (!subject) return { success: false, error: "Subject is required." };
  if (subject.length > 200) return { success: false, error: "Subject is too long." };
  if (htmlIsEmpty(html)) return { success: false, error: "Message body is required." };
  if (html.length > 5_000_000) return { success: false, error: "Message is too large." };

  let recipients: { name: string; email: string }[];
  try {
    if (mode === "individual") {
      if (!targetId) return { success: false, error: "No recipient selected." };
      const c = await db.customers.findUnique({
        where: { id: targetId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (!c) return { success: false, error: "Customer not found." };
      recipients = [
        { name: `${c.firstName} ${c.lastName}`.trim() || "Customer", email: c.email },
      ];
    } else {
      const list = await db.customers.findMany({
        where: { isActive: true },
        select: { firstName: true, email: true },
      });
      recipients = list.map((c) => ({ name: c.firstName, email: c.email }));
    }
  } catch (e) {
    console.error("emailCustomers recipient lookup failed:", e);
    return { success: false, error: "Could not load recipients." };
  }

  const emails = [...new Set(recipients.map((r) => r.email).filter(Boolean))];
  if (emails.length === 0) {
    return { success: false, error: "No customers to email." };
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
      senderName: sender?.name || "Ankrah F&L",
    });
  } catch (e) {
    console.error("emailCustomers send failed:", e);
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
        : `Email sent to ${emails.length} customer${emails.length === 1 ? "" : "s"}.`,
  };
}