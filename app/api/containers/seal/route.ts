// app/api/containers/seal/route.ts
// POST — closes and seals a loaded container. This is the moment the
// container gets its FIRST status (In_Transit) and every invoice loaded
// into it cascades to In-Transit with statusHistory rows, in one transaction.
//
// The submitted seal is VERIFIED against the seal stored at initialization —
// this route never overwrites the seal. Vessel/shipping line may still be
// corrected here since booking details sometimes firm up at closing.

import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/session"; // adjust to your session utils path
import { sendMail } from "../../../lib/mail";

const BodySchema = z.object({
  containerNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(4)
    .max(20)
    .regex(/^[A-Z0-9-]+$/),
  sealNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9-]+$/),
  vessel: z.string().trim().min(1).max(120).optional(),
  shippingLine: z.string().trim().min(1).max(120).optional(),
});

const CASCADE_FROM = "Received At Origin";
const CASCADE_TO = "In-Transit";

function sealsMatch(submitted: string, stored: string): boolean {
  const a = createHash("sha256").update(submitted.toUpperCase()).digest();
  const b = createHash("sha256").update(stored.toUpperCase()).digest();
  return timingSafeEqual(a, b);
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

// Inner HTML for the "now In-Transit" notice — wrapped in the branded card by
// sendMail. Sent to the booking customer (consigner) when their container is
// sealed and their shipment begins the ocean leg.
function inTransitEmailHtml(d: {
  consignerName: string;
  invoiceNumber: string;
  consigneeName: string;
  destinationCity: string;
  vessel: string | null;
}): string {
  const vesselLine = d.vessel
    ? `<p style="margin:0 0 12px;">Vessel: <strong>${escapeHtml(d.vessel)}</strong></p>`
    : "";
  return `
    <h2 style="color:#0f172a;font-size:1.3rem;margin:0 0 4px;text-align:center;">Your shipment is on its way &#128674;</h2>
    <p style="text-align:center;color:#2e63af;font-weight:600;margin:0 0 22px;">Now In Transit to Ghana</p>
    <p style="margin:0 0 12px;">Hi <strong>${escapeHtml(d.consignerName)}</strong>,</p>
    <p style="margin:0 0 12px;">Your shipment <strong>#${escapeHtml(d.invoiceNumber)}</strong> has left our USA hub and is now on the ocean leg to <strong>${escapeHtml(d.destinationCity)}</strong>, consigned to <strong>${escapeHtml(d.consigneeName)}</strong>.</p>
    ${vesselLine}
    <p style="margin:0 0 12px;">We&#39;ll email you again when it arrives at the port in Ghana and when it&#39;s out for delivery.</p>
    <p style="margin:22px 0 0;">Thank you for shipping with Ankrah F&amp;L.</p>`;
}

export async function POST(req: NextRequest) {
  try {
    // 1. AuthN
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. AuthZ — sealing is an origin-side action
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
    const { containerNumber, sealNumber, vessel, shippingLine } = parsed.data;

    // 4. Container must exist and still be open
    const container = await db.container.findUnique({
      where: { id: containerNumber },
      select: { id: true, status: true, sealNumber: true },
    });
    if (!container) {
      return NextResponse.json(
        { error: "Container not found." },
        { status: 404 },
      );
    }
    if (container.status !== null) {
      return NextResponse.json(
        { error: "This container has already been sealed." },
        { status: 409 },
      );
    }

    // 5. Verify — never overwrite — the seal recorded at initialization
    if (!container.sealNumber || !sealsMatch(sealNumber, container.sealNumber)) {
      console.warn(
        `[SECURITY] Seal mismatch at closing — container=${containerNumber} user=${session.userId}`,
      );
      return NextResponse.json(
        {
          error:
            "Submitted seal does not match the seal registered for this container. Verify the physical seal.",
        },
        { status: 409 },
      );
    }

    // 6. Refuse to seal an empty container
    const loadedCount = await db.invoice.count({
      where: { containerId: containerNumber },
    });
    if (loadedCount === 0) {
      return NextResponse.json(
        { error: "No invoices are loaded into this container." },
        { status: 409 },
      );
    }

    // 7. Seal + cascade in one transaction
    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      await tx.container.update({
        where: { id: containerNumber },
        data: {
          status: "In_Transit", // Prisma enum identifier → stored as "In-Transit"
          ...(vessel ? { vessel } : {}),
          ...(shippingLine ? { shippingLine } : {}),
        },
      });

      // Only invoices in the expected prior state cascade
      const invoices = await tx.invoice.findMany({
        where: { containerId: containerNumber, status: CASCADE_FROM },
        select: {
          id: true,
          invoiceNumber: true,
          consignerEmail: true,
          consignerName: true,
          consigneeName: true,
          destinationCity: true,
        },
      });

      const ids = invoices.map((i) => i.id);
      if (ids.length > 0) {
        await tx.invoice.updateMany({
          where: { id: { in: ids } },
          data: { status: CASCADE_TO, loadStatus: "Full" },
        });

        await tx.statusHistory.createMany({
          data: ids.map((id) => ({
            id: crypto.randomUUID(),
            invoiceId: id,
            status: CASCADE_TO,
            changedById: session.userId,
            createdAt: now,
          })),
        });
      }

      return { cascaded: ids.length, invoices };
    });

    // Notify each consigner that their shipment has departed and is now
    // In-Transit. Best-effort and sequential: the seal transaction has already
    // committed, so a mail failure must never undo it or fail the request.
    for (const inv of result.invoices) {
      const email = (inv.consignerEmail || "").trim();
      if (!email) continue;
      try {
        await sendMail({
          to: email,
          subject: `In Transit — Invoice #${inv.invoiceNumber}`,
          bodyHtml: inTransitEmailHtml({
            consignerName: inv.consignerName ?? "",
            invoiceNumber: inv.invoiceNumber,
            consigneeName: inv.consigneeName ?? "",
            destinationCity: inv.destinationCity ?? "",
            vessel: vessel || null,
          }),
        });
      } catch (mailErr) {
        console.error(`In-Transit email failed for ${inv.invoiceNumber}:`, mailErr);
      }
    }

    return NextResponse.json({
      ok: true,
      containerStatus: "In-Transit",
      cascaded: result.cascaded,
      loaded: loadedCount,
    });
  } catch (error) {
    console.error("❌ Container seal failure:", error); // detail server-side only
    return NextResponse.json(
      { error: "Failed to seal the container." },
      { status: 500 },
    );
  }
}