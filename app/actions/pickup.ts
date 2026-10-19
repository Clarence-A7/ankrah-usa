// app/dashboard/actions/pickup.ts
"use server";

import { z } from "zod";
import { db } from "../lib/db";
import { getSession } from "../lib/session"; // adjust path to your session utils
import { sendDispatchManifest } from "../lib/dispatch-manifest";

export interface DriverOption {
  staffId: string;
  name: string;
  phone: string | null;
}

const ALLOWED_ROLES = ["origin_admin", "super_admin"];

// Invoices may only be dispatched for pickup from this status:
const DISPATCHABLE_FROM = "READY FOR PICKUP";
const DISPATCH_TO = "Pending Pickup"; // status after dispatch

const InvoiceNumbersSchema = z
  .array(
    z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Za-z0-9-]+$/),
  )
  .min(1)
  .max(200); // sanity cap for bulk dispatch

const StaffIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[A-Za-z0-9-]+$/);

export async function getAvailableDrivers(): Promise<DriverOption[]> {
  // Server actions are HTTP endpoints — auth lives here, not in the modal
  const session = await getSession();
  if (!session?.userId || !ALLOWED_ROLES.includes(session.role)) {
    return []; // no session/role → no driver data leaves the server
  }

  const drivers = await db.user.findMany({
    where: {
      role: "o_driver",
      staffId: { not: null }, // a driver without a staffId can't be assigned
    },
    select: {
      staffId: true,
      name: true,
      phone: true,
    },
    orderBy: { name: "asc" },
  });

  return drivers.map((d) => ({
    staffId: d.staffId as string,
    name: d.name,
    phone: d.phone ?? null,
  }));
}

export async function dispatchInvoices(
  invoiceNumbers: string[],
  staffId: string,
): Promise<{ success: boolean; error?: string; dispatched?: number; skipped?: number }> {
  // 1. AuthN + AuthZ
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Not authenticated." };
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return { success: false, error: "Not authorized to dispatch pickups." };
  }

  // 2. Input validation
  const invParsed = InvoiceNumbersSchema.safeParse(invoiceNumbers);
  const staffParsed = StaffIdSchema.safeParse(staffId);
  if (!invParsed.success || !staffParsed.success) {
    return { success: false, error: "Invalid invoice numbers or driver ID." };
  }

  // 3. The staffId must belong to a real o_driver — never trust the
  //    submitted value, even though the dropdown "only" shows drivers
  const driver = await db.user.findFirst({
    where: { staffId: staffParsed.data, role: "o_driver" },
    select: { id: true, staffId: true, name: true, email: true, phone: true },
  });
  if (!driver) {
    return { success: false, error: "Selected driver not found or not a pickup driver." };
  }

  try {
    const now = new Date();

    const result = await db.$transaction(async (tx) => {
      // 4. Status guard — only invoices currently Ready For Pickup move
      const eligible = await tx.invoice.findMany({
where: {
  id: { in: invParsed.data },
  status: DISPATCHABLE_FROM,
  // NOTE: pickup (origin) dispatch is intentionally NOT gated on payment —
  // an o_driver can be dispatched regardless of amountDue. Only DELIVERY
  // (destination) dispatch requires amountDue = 0.
},
        select: { id: true, invoiceNumber: true },
      });

      if (eligible.length === 0) return { dispatched: 0, numbers: [] as string[] };

      const ids = eligible.map((i) => i.id);
      const numbers = eligible.map((i) => i.invoiceNumber);

      await tx.invoice.updateMany({
        where: { id: { in: ids } },
        data: {
          pickupDriver: driver.staffId, // pickup assignment → pickupDriver
          status: DISPATCH_TO,
        },
      });

      await tx.statusHistory.createMany({
        data: ids.map((id) => ({
          id: crypto.randomUUID(),
          invoiceId: id,
          status: DISPATCH_TO,
          changedById: session.userId,
          createdAt: now,
        })),
      });

      return { dispatched: ids.length, numbers };
    });

    const skipped = invParsed.data.length - result.dispatched;
    if (result.dispatched === 0) {
      return {
        success: false,
        error: "No selected invoices are in 'Ready For Pickup' status.",
      };
    }

    // Email the driver their pickup run sheet (PDF). Non-blocking: never
    // throws, and the assignment is already committed above.
    const dispatcher = await db.user.findUnique({
      where: { id: session.userId },
      select: { name: true },
    });
    await sendDispatchManifest({
      side: "origin",
      invoiceNumbers: result.numbers,
      driver: { name: driver.name, email: driver.email, phone: driver.phone },
      dispatchedBy: dispatcher?.name ?? "Admin",
    });

    return { success: true, dispatched: result.dispatched, skipped };
  } catch (error) {
    console.error("Dispatch failed:", error); // detail server-side only
    return { success: false, error: "Failed to assign driver to invoices." };
  }
}

// ── Admin pickup scheduling ────────────────────────────────────────────────
// An admin sets/updates the first-mile pickup date & time on a paid order that
// is awaiting (or dispatched for) pickup. Every (re)schedule is appended to
// StatusHistory — never a silent overwrite. AuthN/AuthZ enforced here, not just
// in middleware. The live invoice.status is left unchanged (scheduling is
// orthogonal to the pickup pipeline position).

const SCHEDULABLE_STATUSES = ["Ready For Pickup", "Pending Pickup"];

const SchedulePickupSchema = z.object({
  invoiceId: z.string().trim().min(1).max(64),
  // ISO 8601 (the modal sends new Date(localValue).toISOString()); accepts a
  // bare "YYYY-MM-DDThh:mm" too. Past/sane-range checks are done below.
  scheduledAt: z
    .string()
    .trim()
    .max(40)
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/),
});

export async function schedulePickup(
  invoiceId: string,
  scheduledAt: string,
): Promise<{ success: boolean; error?: string; scheduledPickupAt?: string }> {
  // 1. AuthN + AuthZ
  const session = await getSession();
  if (!session?.userId) {
    return { success: false, error: "Not authenticated." };
  }
  if (!ALLOWED_ROLES.includes(session.role)) {
    return { success: false, error: "Not authorized to schedule pickups." };
  }

  // 2. Input validation (shape) + explicit future/sane-range (semantics)
  const parsed = SchedulePickupSchema.safeParse({ invoiceId, scheduledAt });
  if (!parsed.success) {
    return { success: false, error: "Invalid pickup date/time." };
  }
  const when = new Date(parsed.data.scheduledAt);
  const now = new Date();
  const oneYearOut = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  if (
    Number.isNaN(when.getTime()) ||
    when.getTime() <= now.getTime() ||
    when.getTime() > oneYearOut.getTime()
  ) {
    return {
      success: false,
      error: "Pickup must be a future date within the next year.",
    };
  }

  try {
    const invoice = await db.invoice.findUnique({
      where: { id: parsed.data.invoiceId },
      select: { id: true, status: true, scheduledPickupAt: true },
    });
    if (!invoice) {
      return { success: false, error: "Order not found." };
    }
    if (!SCHEDULABLE_STATUSES.includes(invoice.status)) {
      return { success: false, error: "This order is not awaiting pickup." };
    }

    const isReschedule = invoice.scheduledPickupAt != null;
    // Compact audit label — StatusHistory.status is VarChar(50).
    const stamp = when.toISOString().slice(0, 16).replace("T", " "); // YYYY-MM-DD HH:mm (UTC)
    const auditStatus =
      `${isReschedule ? "Pickup rescheduled" : "Pickup scheduled"}: ${stamp}`.slice(0, 50);

    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          scheduledPickupAt: when,
          scheduledPickupBy: session.userId,
          scheduledPickupSetAt: now,
        },
      });
      await tx.statusHistory.create({
        data: {
          id: crypto.randomUUID(),
          invoiceId: invoice.id,
          status: auditStatus,
          changedById: session.userId,
          createdAt: now,
        },
      });
    });

    return { success: true, scheduledPickupAt: when.toISOString() };
  } catch (error) {
    console.error("schedulePickup failed:", error); // detail server-side only
    return { success: false, error: "Failed to schedule pickup." };
  }
}