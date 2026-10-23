// app/api/shipments/[id]/deliver/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "./../../../../lib/db";
import { getSession } from "@/app/lib/session";

const ADMIN_ROLES = new Set(["super_admin", "origin_admin", "destination_admin"]);
const DRIVER_ROLES = new Set(["o_driver", "d_driver"]);

// Proof of delivery is required. Accept a reasonably-sized, compressed image
// data URI only (the client resizes before upload, so this is generous headroom).
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }, // ← Promise type
) {
  const { id } = await params; // ← await it

  if (!id) {
    return NextResponse.json({ error: "Shipment ID is required" }, { status: 400 });
  }

  // --- Authorization -------------------------------------------------------
  // /api/* is NOT covered by the middleware matcher, so this route guards
  // itself. Only signed-in admins or drivers may mark a delivery, and a driver
  // may only complete a shipment assigned to them.
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = ADMIN_ROLES.has(session.role);
  const isDriver = DRIVER_ROLES.has(session.role);
  if (!isAdmin && !isDriver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // --- Proof-of-delivery photo (required) ----------------------------------
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const photo =
    body && typeof body === "object" && typeof (body as { photo?: unknown }).photo === "string"
      ? (body as { photo: string }).photo
      : "";

  const match = photo.match(PHOTO_RE);
  if (!match) {
    return NextResponse.json(
      { error: "A delivery photo is required to confirm delivery." },
      { status: 400 },
    );
  }
  if ((match[2].length * 3) / 4 > MAX_PHOTO_BYTES) {
    return NextResponse.json(
      { error: "The delivery photo is too large. Please retake it." },
      { status: 400 },
    );
  }

  const shipment = await db.invoice.findUnique({
    where: { id },
    select: { id: true, deliveryDriver: true },
  });

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  if (isDriver && !isAdmin) {
    if (!session.staffId || session.staffId !== shipment.deliveryDriver) {
      return NextResponse.json(
        { error: "This shipment is not assigned to you" },
        { status: 403 },
      );
    }
  }

  try {
    const capturedBy = session.staffId ?? session.userId;
    const now = new Date();

    await db.$transaction([
      db.invoice.update({
        where: { id },
        data: { status: "Delivered", deliveredAt: now },
      }),
      db.deliveryProof.upsert({
        where: { invoiceId: id },
        update: { photo, capturedBy, capturedAt: now },
        create: { invoiceId: id, photo, capturedBy },
      }),
      db.statusHistory.create({
        data: { invoiceId: id, status: "Delivered", changedById: session.userId },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark shipment as delivered:", error);
    return NextResponse.json(
      { error: "Failed to update shipment status" },
      { status: 500 },
    );
  }
}
