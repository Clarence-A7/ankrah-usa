// app/api/shipments/[id]/collect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";

const DRIVER_ROLES = new Set(["o_driver", "d_driver", "DRIVER"]);
const ADMIN_ROLES = new Set(["origin_admin", "super_admin", "ADMIN"]);

function normalizeStatus(status: string | null | undefined): string {
  return (status || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Next.js 16: params is a Promise and must be awaited before use.
  const { id: shipmentId } = await params;

  if (!shipmentId) {
    return NextResponse.json({ error: "Missing shipment id" }, { status: 400 });
  }

  const session = await getCurrentUserSession();
  if (!session || !session.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = ADMIN_ROLES.has(session.role);
  const isDriver = DRIVER_ROLES.has(session.role);

  if (!isAdmin && !isDriver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shipment = await db.invoice.findUnique({
    where: { id: shipmentId },
    select: { id: true, status: true, pickupDriver: true },
  });

  if (!shipment) {
    return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
  }

  // Drivers may only collect shipments assigned to them; admins can act on any.
  // Prevents a driver from PATCHing an arbitrary shipment id they discover/guess.
  if (isDriver && !isAdmin) {
    const userProfile = await db.user.findUnique({
      where: { id: session.id },
      select: { staffId: true },
    });

    if (!userProfile?.staffId || userProfile.staffId !== shipment.pickupDriver) {
      return NextResponse.json(
        { error: "This shipment is not assigned to you" },
        { status: 403 },
      );
    }
  }

  const currentStatus = normalizeStatus(shipment.status);

  if (currentStatus === "COLLECTED") {
    return NextResponse.json(
      { error: "Shipment is already marked collected" },
      { status: 409 },
    );
  }

  if (currentStatus !== "PENDING_PICKUP") {
    return NextResponse.json(
      { error: `Cannot collect a shipment in status "${shipment.status}"` },
      { status: 409 },
    );
  }

  // Store the canonical title-case status ("Collected"), not "COLLECTED" — the
  // admin Pickups tabs and the mark-received action match on the exact string in
  // statuses.ts, so the wrong case made collected shipments vanish from the queue.
  // Also record the transition in statushistory (feeds the driver trend + the
  // customer tracking timeline).
  const [updated] = await db.$transaction([
    db.invoice.update({
      where: { id: shipmentId },
      data: { status: "Collected" },
      select: { id: true, status: true },
    }),
    db.statusHistory.create({
      data: { invoiceId: shipmentId, status: "Collected", changedById: session.id },
    }),
  ]);

  return NextResponse.json({ id: updated.id, status: updated.status });
}