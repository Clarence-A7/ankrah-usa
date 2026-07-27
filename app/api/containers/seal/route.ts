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
        select: { id: true },
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

      return { cascaded: ids.length };
    });

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