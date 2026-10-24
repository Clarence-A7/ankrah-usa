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
        items: { where: { isCharge: false }, select: { itemType: true, quantity: true } },
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

    // 6. The scanned item type must belong to this invoice's manifest
    const manifestItem = invoice.items.find(
      (i) => i.itemType.toLowerCase() === itemType.toLowerCase(),
    );
    if (!manifestItem) {
      return NextResponse.json(
        {
          error: `"${itemType}" is not on invoice ${invoiceNumber}'s manifest.`,
        },
        { status: 409 },
      );
    }

    // 7. Link invoice to container on first scan (status unchanged until seal)
    if (!alreadyLinked) {
      await db.invoice.update({
        where: { id: invoice.id },
        data: { containerId: containerNumber, loadStatus: "Partial" },
      });
    }

    const totalBooked = invoice.items.reduce((a, i) => a + i.quantity, 0);

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
      totalBooked,
      // The terminal UI counts physical scans locally; server reports the
      // booked total so the client can decide Partial vs Full display.
      loadStatus: "Partial",
    });
  } catch (error) {
    console.error("❌ Scan-item failure:", error); // detail server-side only
    return NextResponse.json(
      { error: "Failed to record the scan." },
      { status: 500 },
    );
  }
}