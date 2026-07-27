import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";

// Only origin admins may advance a shipment past collection — drivers hand
// off physical custody, but confirming arrival at the warehouse is an
// admin-verified checkpoint, not something the mobile driver flow triggers.
const ADMIN_ROLES = new Set(["origin_admin", "super_admin", "ADMIN"]);

const SOURCE_STATUS = ["Collected", "Booked"]; // status before marking received
const TARGET_STATUS = "Received At Origin";
const MAX_BATCH_SIZE = 100;

export async function PATCH(request: NextRequest) {
  const session = await getCurrentUserSession();
  if (!session || !session.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ADMIN_ROLES.has(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawIds = (body as { ids?: unknown })?.ids;

  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json(
      { error: "Provide a non-empty array of shipment ids" },
      { status: 400 },
    );
  }

  if (rawIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Cannot update more than ${MAX_BATCH_SIZE} invoices at once` },
      { status: 400 },
    );
  }

  const ids = Array.from(
    new Set(
      rawIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      ),
    ),
  );

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "No valid shipment ids provided" },
      { status: 400 },
    );
  }

  try {
    const updatedCount = await db.$transaction(async (tx) => {
      const existing = await tx.invoice.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true },
      });

      if (existing.length !== ids.length) {
        const foundIds = new Set(existing.map((inv) => inv.id));
        const missing = ids.filter((id) => !foundIds.has(id));
        throw new Error(`Shipment(s) not found: ${missing.join(", ")}`);
      }

      const notCollected = existing.filter(
        (inv) => !SOURCE_STATUS.includes(inv.status),
      );
      if (notCollected.length > 0) {
        throw new Error(
          `${notCollected.length} shipment(s) are not in "${SOURCE_STATUS.join(', ')}" status and cannot be marked received`,
        );
      }

      const result = await tx.invoice.updateMany({
        where: { id: { in: ids }, status: { in: SOURCE_STATUS } },
        data: { status: TARGET_STATUS },
      });

      if (result.count !== ids.length) {
        // Someone else changed status between the read above and this write.
        throw new Error(
          "Shipment status changed concurrently — please refresh and try again",
        );
      }

      return result.count;
    });

    return NextResponse.json({ updated: updatedCount, status: TARGET_STATUS });
  } catch (error) {
    console.error("Failed to mark shipments as received:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update shipment status";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}