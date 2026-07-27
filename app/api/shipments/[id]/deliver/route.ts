// app/api/shipments/[id]/deliver/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "./../../../../lib/db";
import { getSession } from "@/app/lib/session";

const ADMIN_ROLES = new Set(["super_admin", "origin_admin", "destination_admin"]);
const DRIVER_ROLES = new Set(["o_driver", "d_driver"]);

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }, // ← Promise type
) {
  const { id } = await params; // ← await it

  if (!id) {
    return NextResponse.json(
      { error: "Shipment ID is required" },
      { status: 400 },
    );
  }

  // --- Authorization -------------------------------------------------------
  // /api/* is NOT covered by the middleware matcher, so this route must guard
  // itself. Only signed-in admins or drivers may mark a delivery, and a driver
  // may only complete a shipment assigned to them (prevents PATCHing an
  // arbitrary id they guess).
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = ADMIN_ROLES.has(session.role);
  const isDriver = DRIVER_ROLES.has(session.role);
  if (!isAdmin && !isDriver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const updated = await db.invoice.update({
      where: { id },
      data: { status: "Delivered" },
    });

    return NextResponse.json({ success: true, shipment: updated });
  } catch (error) {
    console.error("Failed to mark shipment as delivered:", error);
    return NextResponse.json(
      { error: "Failed to update shipment status" },
      { status: 500 },
    );
  }
}
