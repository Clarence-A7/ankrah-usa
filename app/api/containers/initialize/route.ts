// app/api/containers/initialize/route.ts
// POST — registers a container at the origin hub (or updates one that is
// still open). Containers start with NO status (NULL = loading); the sealing
// flow later sets In_Transit.
//
// Security notes specific to this route:
//  - This endpoint writes sealNumber — the root of trust for the destination
//    seal verification. Only origin_admin/super_admin may touch it, and only
//    while the container is still open (status NULL). Once a container is
//    In-Transit or beyond, its seal and identity are immutable here.
//  - loadedBy comes from the session, never from the client.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/session"; // adjust to your session utils path

const BodySchema = z.object({
  containerNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(4, "Container number too short")
    .max(20, "Container number too long")
    .regex(/^[A-Z0-9-]+$/, "Container number contains invalid characters"),
  sealNumber: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, "Seal number too short")
    .max(32, "Seal number too long")
    .regex(/^[A-Z0-9-]+$/, "Seal number contains invalid characters"),
  size: z.coerce.number().int().refine((n) => n === 20 || n === 40, {
    message: "Container size must be 20 or 40",
  }),
  vessel: z.string().trim().min(1).max(120),
  shippingLine: z.string().trim().min(1).max(120),
  originCity: z.string().trim().min(1).max(120),
  destinationCity: z.string().trim().min(1).max(120),
  // ISO date strings from the form; both must be real dates, eta after departure
  departureDate: z.coerce.date(),
  eta: z.coerce.date(),
}).refine((b) => b.eta > b.departureDate, {
  message: "ETA must be after the departure date",
  path: ["eta"],
});

export async function POST(request: NextRequest) {
  try {
    // 1. AuthN — no session, no DB work
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. AuthZ — container registration is an origin-side action
    if (!["origin_admin", "super_admin"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Validate body
    let raw: unknown;
    try {
      raw = await request.json();
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
    const data = parsed.data;

    // 4. Immutability guard — a container that has left the origin hub
    //    can never have its identity or seal rewritten through this route.
    const existing = await db.container.findUnique({
      where: { id: data.containerNumber },
      select: { id: true, status: true },
    });

    if (existing && existing.status !== null) {
      console.warn(
        `[SECURITY] Attempt to modify sealed/shipped container ${data.containerNumber} by user=${session.userId}`,
      );
      return NextResponse.json(
        {
          error:
            "This container has already been sealed or shipped and can no longer be edited.",
        },
        { status: 409 },
      );
    }

    // 5. Seal uniqueness (schema enforces it too — this gives a clean message
    //    instead of a raw constraint error)
    const sealTaken = await db.container.findFirst({
      where: { sealNumber: data.sealNumber, NOT: { id: data.containerNumber } },
      select: { id: true },
    });
    if (sealTaken) {
      return NextResponse.json(
        { error: "This seal number is already assigned to another container." },
        { status: 409 },
      );
    }

    // 6. Create or update the still-open container.
    //    No status field — NULL means loading; the sealing flow sets In_Transit.
    const fields = {
      sealNumber: data.sealNumber,
      size: data.size,
      vessel: data.vessel,
      shippingLine: data.shippingLine,
      originCity: data.originCity,
      destinationCity: data.destinationCity,
      departureDate: data.departureDate,
      eta: data.eta,
      loadedBy: session.email ?? session.userId, // from session, never the client
    };

    const container = await db.container.upsert({
      where: { id: data.containerNumber },
      update: fields,
      create: { id: data.containerNumber, ...fields },
    });

    // Don't echo the seal back — the client already knows what it submitted,
    // and responses shouldn't circulate it further.
    const { sealNumber: _omit, ...safeContainer } = container;
    return NextResponse.json({ success: true, container: safeContainer });
  } catch (error) {
    console.error("❌ Container initialize failure:", error); // detail server-side only
    return NextResponse.json(
      { error: "Failed to register container." },
      { status: 500 },
    );
  }
}