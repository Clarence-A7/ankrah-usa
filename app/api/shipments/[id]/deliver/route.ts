// app/api/shipments/[id]/deliver/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "./../../../../lib/db";

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