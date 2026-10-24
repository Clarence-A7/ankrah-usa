// app/api/containers/[id]/scan-receive/route.ts
// POST — records ONE PHYSICAL PIECE as received against a specific
// invoice + item type. Body: { invoiceNumber: string, itemType: string, itemId?: string }
//
// Why item-level, not invoice-level:
//   quantity on ManifestItem is an aggregate ("3 Barrels" = one row), so a
//   single scan can no longer be allowed to close out the whole invoice —
//   that would let 4 of 5 boxes go missing and still show "received".
//   Each scan increments that item row's scannedQuantity. The invoice only
//   flips to "Received At Hub" once EVERY item row on it is fully scanned.
//
// Container.status is still never touched here — same reasoning as before:
// the container stays "Cleared" for the whole unstuffing session.
//
// "Comparing data" (unchanged from the invoice-level version):
//   invoiceNumber is looked up globally, then checked against this
//   container. Wrong-container scans are flagged distinctly from
//   not-found scans (WRONG_CONTAINER vs NOT_ON_MANIFEST).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/app/lib/db";
import { getSession } from "@/app/lib/session";

const BodySchema = z.object({
  invoiceNumber: z
    .string()
    .trim()
    .min(2, "Invoice number too short")
    .max(40, "Invoice number too long")
    .regex(/^[A-Za-z0-9-]+$/, "Invoice number contains invalid characters"),
  itemType: z
    .string()
    .trim()
    .min(1, "Item type is required")
    .max(80, "Item type too long"),
  // Present only on JSON labels with a per-piece ID. Not enforced for
  // dedup yet (no unique-piece column on ManifestItem) — reserved for a
  // future migration to true per-piece rows if that's ever needed.
  itemId: z.string().trim().max(80).optional(),
});

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 300;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

const RECEIVED_OR_LATER = new Set([
  "RECEIVED AT HUB",
  "RETURNED TO HUB",
  "READY FOR DELIVERY",
  "OUT FOR DELIVERY",
  "DELIVERED",
]);

// Loose match: gun/QR item types shouldn't be defeated by case or
// incidental whitespace differences from how the label was printed.
const sameItemType = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 1. AuthN
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. AuthZ
  if (!["destination_admin", "super_admin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: containerId } = await params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(containerId)) {
    return NextResponse.json({ error: "Invalid container id" }, { status: 400 });
  }

  // 3. Rate limit
  const rlKey = `${session.userId}:${containerId}`;
  if (isRateLimited(rlKey)) {
    console.warn(
      `[SECURITY] scan-receive rate limit hit — user=${session.userId} container=${containerId}`,
    );
    return NextResponse.json(
      { error: "Too many scan attempts. Pause and try again shortly." },
      { status: 429 },
    );
  }

  // 4. Body validation
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const invoiceNumber = parsed.data.invoiceNumber.toUpperCase();
  const scannedItemType = parsed.data.itemType;

  // 5. Container must be CLEARED (strict enum — exact match)
  const container = await db.container.findUnique({
    where: { id: containerId },
    select: { id: true, status: true },
  });
  if (!container) {
    return NextResponse.json({ error: "Container not found" }, { status: 404 });
  }
  if (container.status !== "Cleared") {
    return NextResponse.json(
      {
        error:
          container.status === "Arrived"
            ? "Seal has not been verified yet. Open the container first."
            : "Container is not open for unstuffing.",
        code: "CONTAINER_NOT_OPEN",
      },
      { status: 409 },
    );
  }

  // 6. Global lookup + comparison against THIS container's manifest
  const invoice = await db.invoice.findUnique({
    where: { invoiceNumber },
    select: {
      id: true,
      status: true,
      containerId: true,
      items: {
        // Cargo only — money lines (surcharge/tax/discount) are never scanned.
        where: { isCharge: false },
        select: { id: true, itemType: true, quantity: true, scannedQuantity: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!invoice) {
    return NextResponse.json(
      { error: `Invoice ${invoiceNumber} was not found in the system.`, code: "NOT_ON_MANIFEST" },
      { status: 404 },
    );
  }

  if (invoice.containerId !== containerId) {
    console.warn(
      `[SECURITY] SCAN MISMATCH — invoice=${invoiceNumber} expectedContainer=${containerId} actualContainer=${invoice.containerId} user=${session.userId}`,
    );
    return NextResponse.json(
      {
        error: `Invoice ${invoiceNumber} belongs to a different container. Do not unstuff this item here — verify with a super admin before proceeding.`,
        code: "WRONG_CONTAINER",
      },
      { status: 409 },
    );
  }

  // 7. Invoice-level status sanity
  const normInvoiceStatus = (invoice.status || "").toUpperCase().replace(/[-_]/g, " ").trim();
  if (RECEIVED_OR_LATER.has(normInvoiceStatus)) {
    return NextResponse.json(
      { error: `Invoice ${invoiceNumber} is already fully received.`, code: "ALREADY_SCANNED" },
      { status: 409 },
    );
  }
  if (normInvoiceStatus !== "CLEARED") {
    return NextResponse.json(
      {
        error: `Invoice ${invoiceNumber} is in status "${invoice.status}" and cannot be received. Escalate to a super admin.`,
        code: "INVALID_INVOICE_STATUS",
      },
      { status: 409 },
    );
  }

  // 8. Item-level match: first row of this type with capacity remaining.
  //    Multiple rows of the same itemType on one invoice are filled in
  //    creation order rather than picked ambiguously.
  const rowsOfType = invoice.items.filter((i) => sameItemType(i.itemType, scannedItemType));
  if (rowsOfType.length === 0) {
    return NextResponse.json(
      {
        error: `"${scannedItemType}" is not on invoice ${invoiceNumber}'s manifest.`,
        code: "ITEM_NOT_ON_INVOICE",
      },
      { status: 409 },
    );
  }
  const targetItem = rowsOfType.find((i) => i.scannedQuantity < i.quantity);
  if (!targetItem) {
    return NextResponse.json(
      {
        error: `All "${scannedItemType}" pieces on invoice ${invoiceNumber} are already scanned.`,
        code: "ALREADY_SCANNED",
      },
      { status: 409 },
    );
  }

  // 9. Atomic increment + invoice completion check, one transaction
  const now = new Date();
  let invoiceFullyReceived = false;
  let invoicePiecesRemaining = 0;
  let updatedScannedQuantity = 0;

  try {
    await db.$transaction(async (tx) => {
      // Optimistic concurrency on the exact scannedQuantity we just read —
      // if a racing scan got there first, count === 0 and we bail.
      const updated = await tx.manifestItem.updateMany({
        where: { id: targetItem.id, scannedQuantity: targetItem.scannedQuantity },
        data: { scannedQuantity: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw Object.assign(new Error("SCAN_CONFLICT"), { code: "SCAN_CONFLICT" });
      }
      updatedScannedQuantity = targetItem.scannedQuantity + 1;

      // Re-read all item rows for this invoice (sees our own write) to
      // check whether the whole invoice is now fully scanned.
      const allItems = await tx.manifestItem.findMany({
        where: { invoiceId: invoice.id, isCharge: false },
        select: { quantity: true, scannedQuantity: true },
      });
      invoicePiecesRemaining = allItems.reduce(
        (acc, i) => acc + Math.max(i.quantity - i.scannedQuantity, 0),
        0,
      );
      invoiceFullyReceived = invoicePiecesRemaining === 0;

      if (invoiceFullyReceived) {
        const invUpdated = await tx.invoice.updateMany({
          where: { id: invoice.id, status: invoice.status },
          data: { status: "Received At Hub" },
        });
        // If this races with itself (shouldn't, given the item-level
        // conditional above), just skip the history row rather than fail
        // the whole scan — the piece was still correctly counted.
        if (invUpdated.count > 0) {
          await tx.statusHistory.create({
            data: {
              invoiceId: invoice.id,
              status: "Received At Hub",
              changedById: session.userId,
              createdAt: now,
            },
          });
        }
      }
    });
  } catch (err: any) {
    if (err?.code === "SCAN_CONFLICT") {
      return NextResponse.json(
        { error: "Two scans landed at once — scan again to confirm.", code: "SCAN_CONFLICT" },
        { status: 409 },
      );
    }
    console.error(
      `[SCAN-RECEIVE] Transaction failed — container=${containerId} invoice=${invoiceNumber} item=${scannedItemType}`,
      err,
    );
    return NextResponse.json({ error: "Could not record the scan. Try again." }, { status: 500 });
  }

  // 10. Container-wide progress (outside the transaction — read-only, and a
  //     few-ms-stale count here doesn't affect correctness of the write)
  const containerItems = await db.manifestItem.findMany({
    where: { invoice: { containerId }, isCharge: false },
    select: { quantity: true, scannedQuantity: true },
  });
  const containerPiecesRemaining = containerItems.reduce(
    (acc, i) => acc + Math.max(i.quantity - i.scannedQuantity, 0),
    0,
  );
  const invoicesRemaining = await db.invoice.count({
    where: {
      containerId,
      status: {
        notIn: ["Received At Hub", "Returned To Hub", "Ready For Delivery", "Out For Delivery", "Delivered"],
      },
    },
  });

  return NextResponse.json({
    ok: true,
    invoiceNumber,
    itemType: scannedItemType,
    scannedQuantity: updatedScannedQuantity,
    itemQuantity: targetItem.quantity,
    invoiceFullyReceived,
    invoicePiecesRemaining,
    containerPiecesRemaining,
    invoicesRemaining,
    containerStatus: container.status, // echoed as-is — never changed here
  });
}