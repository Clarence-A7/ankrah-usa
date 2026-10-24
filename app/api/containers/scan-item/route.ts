// app/api/containers/scan-item/route.ts
// POST — records one origin-side loading scan ("InvoiceNumber|ItemType").
// Links the invoice to the still-open container and returns the invoice's
// real details for the terminal ledger. Invoice statuses do NOT change here —
// the seal action cascades everything to In-Transit at once.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/session"; // adjust to your session utils path

const BodySchema = z.object({
  containerNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(4)
    .max(20)
    .regex(/^[A-Z0-9-]+$/),
  invoiceNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9-]+$/),
  itemType: z.string().trim().min(1).max(120),
});

// Invoices may only be loaded once physically received at the origin hub
const LOADABLE_FROM = "Received At Origin";

export async function POST(req: NextRequest) {
  try {
    // 1. AuthN
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. AuthZ — loading is an origin-side action
    if (!["origin_admin", "super_admin"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Validate body
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { containerNumber, invoiceNumber, itemType } = parsed.data;

    // 4. Container must exist and still be OPEN (status NULL).
    //    A sealed/in-transit container can never receive new loads.
    const container = await db.container.findUnique({
      where: { id: containerNumber },
      select: { id: true, status: true },
    });
    if (!container) {
      return NextResponse.json(
        { error: "Container not found. Initialize the session first." },
        { status: 404 },
      );
    }
    if (container.status !== null) {
      return NextResponse.json(
        { error: "This container is already sealed and cannot be loaded." },
        { status: 409 },
      );
    }

    // 5. Invoice must exist, be at the origin hub, and not already sit in a
    //    DIFFERENT container.
    const invoice = await db.invoice.findUnique({
      where: { invoiceNumber },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        containerId: true,
        consignerName: true,
        consigneeName: true,
        consigneePhone: true,
        destinationCity: true,
        amountDue: true,
        // Cargo only — money lines (surcharge/tax/discount) are never loaded or
        // counted as physical pieces.
        items: {
          where: { isCharge: false },
          select: {
            id: true,
            itemType: true,
            quantity: true,
            loadedQuantity: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: `Invoice ${invoiceNumber} not found.` },
        { status: 404 },
      );
    }

    if (invoice.containerId && invoice.containerId !== containerNumber) {
      console.warn(
        `[SECURITY] Cross-container load attempt — invoice=${invoiceNumber} already in ${invoice.containerId}, scanned into ${containerNumber} by user=${session.userId}`,
      );
      return NextResponse.json(
        {
          error: `Invoice ${invoiceNumber} is already assigned to container ${invoice.containerId}.`,
        },
        { status: 409 },
      );
    }

    const alreadyLinked = invoice.containerId === containerNumber;
    if (!alreadyLinked && invoice.status !== LOADABLE_FROM) {
      return NextResponse.json(
        {
          error: `Invoice ${invoiceNumber} is "${invoice.status}" — only "${LOADABLE_FROM}" invoices can be loaded.`,
        },
        { status: 409 },
      );
    }

    // 6. The scanned item type must be on the manifest AND still have an
    //    unloaded piece. This is the server-side over-scan cap: once every
    //    booked piece of a type is loaded, further scans are refused (no 10/9).
    const rowsOfType = invoice.items.filter(
      (i) => i.itemType.toLowerCase() === itemType.toLowerCase(),
    );
    if (rowsOfType.length === 0) {
      return NextResponse.json(
        { error: `"${itemType}" is not on invoice ${invoiceNumber}'s manifest.` },
        { status: 409 },
      );
    }
    const targetItem = rowsOfType.find((i) => i.loadedQuantity < i.quantity);
    if (!targetItem) {
      return NextResponse.json(
        {
          error: `All "${itemType}" pieces on invoice ${invoiceNumber} are already loaded.`,
          code: "ITEM_FULLY_LOADED",
        },
        { status: 409 },
      );
    }

    // 7. Persist the load: bump this item's loaded tally (optimistic
    //    concurrency on the value we just read) and link the invoice to the
    //    container on first scan — atomically. The persisted tally is what
    //    makes a half-loaded container resumable ("Save & Continue Later").
    try {
      await db.$transaction(async (tx) => {
        const bumped = await tx.manifestItem.updateMany({
          where: {
            id: targetItem.id,
            loadedQuantity: targetItem.loadedQuantity,
          },
          data: { loadedQuantity: { increment: 1 } },
        });
        if (bumped.count === 0) {
          throw Object.assign(new Error("LOAD_CONFLICT"), {
            code: "LOAD_CONFLICT",
          });
        }
        if (!alreadyLinked) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { containerId: containerNumber, loadStatus: "Partial" },
          });
        }
      });
    } catch (err: any) {
      if (err?.code === "LOAD_CONFLICT") {
        return NextResponse.json(
          {
            error: "Two scans landed at once — scan again to confirm.",
            code: "LOAD_CONFLICT",
          },
          { status: 409 },
        );
      }
      throw err; // → outer catch → 500
    }

    const totalBooked = invoice.items.reduce((a, i) => a + i.quantity, 0);
    // items were read before the increment, so add this scan's +1.
    const loadedForInvoice =
      invoice.items.reduce((a, i) => a + i.loadedQuantity, 0) + 1;

    return NextResponse.json({
      ok: true,
      invoiceNumber: invoice.invoiceNumber,
      consigner: invoice.consignerName,
      consignee: invoice.consigneeName,
      contact: invoice.consigneePhone,
      destinationCity: invoice.destinationCity,
      amountDue:
        Number(invoice.amountDue) > 0
          ? `GHS ${Number(invoice.amountDue).toLocaleString()}`
          : "GHS 0.00",
      itemType: targetItem.itemType,
      totalBooked,
      loadedForInvoice,
      loadStatus: loadedForInvoice >= totalBooked ? "Full" : "Partial",
    });
  } catch (error) {
    console.error("❌ Scan-item failure:", error); // detail server-side only
    return NextResponse.json(
      { error: "Failed to record the scan." },
      { status: 500 },
    );
  }
}