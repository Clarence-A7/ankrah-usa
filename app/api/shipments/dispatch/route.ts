// app/api/shipments/dispatch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "../../../lib/session";
import { db } from "../../../lib/db";
import { sendDispatchManifest } from "../../../lib/dispatch-manifest";

const DISPATCHABLE_STATUS = ["Received At Hub", "Returned To Hub"]; // Invoices must be at the hub to be dispatched
const DISPATCHED_STATUS = "Out For Delivery";

const dispatchSchema = z.object({
  invoiceNumbers: z
    .array(z.string().min(1).max(64))
    .min(1, "At least one invoice is required")
    .max(100, "Too many invoices in one dispatch"),
  staffId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication before any DB work
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Role-based authorization in the handler itself
    if (
      session.role !== "destination_admin" &&
      session.role !== "super_admin"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Validate input
    const body = await req.json().catch(() => null);
    const parsed = dispatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const { invoiceNumbers, staffId } = parsed.data;
    const uniqueNumbers = [...new Set(invoiceNumbers)];

    // 4. Verify the driver — accept either the User.id (uuid) or the
    //    human-readable staffId code, since the modal may send either.
    const driver = await db.user.findFirst({
      where: {
        role: "d_driver",
        OR: [{ id: staffId }, { staffId: staffId }],
      },
      select: { id: true, staffId: true, name: true, email: true, phone: true },
    });
    if (!driver) {
      return NextResponse.json({ error: "Invalid driver" }, { status: 400 });
    }

    // Canonical value stored on the invoice — the staff code if present,
    // falling back to the user id. Keep this consistent with whatever the
    // d_driver delivery list filters deliveryDriver by.
    const driverRef = driver.staffId ?? driver.id;

    // 5. Transaction: resolve -> guard -> update -> audit, all or nothing
    await db.$transaction(async (tx) => {
      // Resolve invoice numbers to IDs, enforcing eligibility in the query:
      // must be at the hub AND fully paid
      const eligible = await tx.invoice.findMany({
        where: {
          invoiceNumber: { in: uniqueNumbers },
          // FIXED: was `status: DISPATCHABLE_STATUS` -- passing a raw array
          // directly isn't valid Prisma syntax for "matches any of these
          // values" and never matched a real row, for EITHER status. Needs
          // the `{ in: [...] }` filter wrapper.
          status: { in: DISPATCHABLE_STATUS },
          amountDue: 0,
        },
        select: { id: true },
      });

      // If any requested invoice was missing or not eligible, roll back
      if (eligible.length !== uniqueNumbers.length) {
        throw new Error("INELIGIBLE_INVOICES");
      }

      const invoiceIds = eligible.map((inv) => inv.id);

      await tx.invoice.updateMany({
        where: { id: { in: invoiceIds } },
        data: {
          deliveryDriver: driverRef,
          status: DISPATCHED_STATUS,
          dispatchedAt: new Date(),
        },
      });

      // Audit trail — matches the StatusHistory model exactly
      await tx.statusHistory.createMany({
        data: invoiceIds.map((invoiceId) => ({
          invoiceId,
          status: DISPATCHED_STATUS,
          changedById: session.userId,
        })),
      });
    });

    // Email the driver their delivery run sheet (PDF). Non-blocking: this
    // never throws, and the dispatch is already committed above.
    const dispatcher = await db.user.findUnique({
      where: { id: session.userId },
      select: { name: true },
    });
    await sendDispatchManifest({
      side: "destination",
      invoiceNumbers: uniqueNumbers,
      driver: { name: driver.name, email: driver.email, phone: driver.phone },
      dispatchedBy: dispatcher?.name ?? "Admin",
    });

    // 6. Generic success — no sensitive values in the response
    return NextResponse.json({
      success: true,
      dispatched: uniqueNumbers.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INELIGIBLE_INVOICES") {
      return NextResponse.json(
        { error: "One or more invoices are not eligible for dispatch (not at hub or payment outstanding)" },
        { status: 409 },
      );
    }
    console.error("Dispatch route failed:", error);
    return NextResponse.json(
      { error: "Failed to dispatch invoices." },
      { status: 500 },
    );
  }
}