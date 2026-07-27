// app/api/shipments/return/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "../../../lib/session";
import { db } from "../../../lib/db";

const RETURNABLE_STATUS = "Out For Delivery";
const RETURNED_STATUS = "Returned To Hub";

const returnSchema = z.object({
  invoiceNumbers: z
    .array(z.string().min(1).max(64))
    .min(1, "At least one invoice is required")
    .max(100, "Too many invoices in one return"),
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
    const parsed = returnSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const uniqueNumbers = [...new Set(parsed.data.invoiceNumbers)];

    // 4. Transaction: only out-for-delivery invoices can be returned
    await db.$transaction(async (tx) => {
      const eligible = await tx.invoice.findMany({
        where: {
          invoiceNumber: { in: uniqueNumbers },
          status: RETURNABLE_STATUS,
        },
        select: { id: true },
      });

      if (eligible.length !== uniqueNumbers.length) {
        throw new Error("INELIGIBLE_INVOICES");
      }

      const invoiceIds = eligible.map((inv) => inv.id);

      await tx.invoice.updateMany({
        where: { id: { in: invoiceIds } },
        data: {
          status: RETURNED_STATUS,
          deliveryDriver: null, // back at the hub, no driver assigned
        },
      });

      // Audit trail
      await tx.statusHistory.createMany({
        data: invoiceIds.map((invoiceId) => ({
          invoiceId,
          status: RETURNED_STATUS,
          changedById: session.userId,
        })),
      });
    });

    return NextResponse.json({
      success: true,
      returned: uniqueNumbers.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INELIGIBLE_INVOICES") {
      return NextResponse.json(
        { error: "One or more invoices are not out for delivery" },
        { status: 409 },
      );
    }
    console.error("Return route failed:", error);
    return NextResponse.json(
      { error: "Failed to return invoices to hub." },
      { status: 500 },
    );
  }
}