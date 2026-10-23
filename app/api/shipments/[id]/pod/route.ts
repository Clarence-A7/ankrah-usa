// app/api/shipments/[id]/pod/route.ts
// Returns the proof-of-delivery photo for one shipment, on demand (kept out of
// the deliveries list query because the base64 image is large).
import { NextRequest, NextResponse } from "next/server";
import { db } from "./../../../../lib/db";
import { getSession } from "@/app/lib/session";

const ADMIN_ROLES = new Set(["super_admin", "origin_admin", "destination_admin"]);
const DRIVER_ROLES = new Set(["o_driver", "d_driver"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Shipment ID is required" }, { status: 400 });
  }

  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = ADMIN_ROLES.has(session.role);
  const isDriver = DRIVER_ROLES.has(session.role);
  if (!isAdmin && !isDriver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const proof = await db.deliveryProof.findUnique({
    where: { invoiceId: id },
    select: {
      photo: true,
      capturedAt: true,
      capturedBy: true,
      invoice: { select: { deliveryDriver: true } },
    },
  });

  if (!proof) {
    return NextResponse.json({ error: "No delivery photo on file." }, { status: 404 });
  }

  // A driver may only view proof for a shipment assigned to them.
  if (isDriver && !isAdmin) {
    if (!session.staffId || session.staffId !== proof.invoice.deliveryDriver) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({
    photo: proof.photo,
    capturedAt: proof.capturedAt.toISOString(),
    capturedBy: proof.capturedBy,
  });
}
