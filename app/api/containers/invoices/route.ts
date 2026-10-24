// app/api/containers/invoices/route.ts
// GET ?containerId=... — returns the container (status only, never the seal)
// plus its invoices. Auth + role verified before any DB work.

import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/session";

const ALLOWED_ROLES = ["destination_admin", "origin_admin", "super_admin"];

export async function GET(request: NextRequest) {
  try {
const session = await getSession();
if (!session?.userId) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

    // 2. AuthZ — drivers and public callers have no business on this manifest
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Validate input — never trust query params
    const containerId = request.nextUrl.searchParams.get("containerId");
    if (!containerId || !/^[A-Za-z0-9-]{1,64}$/.test(containerId)) {
      return NextResponse.json(
        { error: "A valid 'containerId' query parameter is required." },
        { status: 400 },
      );
    }

    // 4. Fetch container — status for the UI, seal NEVER leaves the server
    const container = await db.container.findUnique({
      where: { id: containerId },
      select: { id: true, status: true }, // do not add sealNumber here
    });

    if (!container) {
      return NextResponse.json(
        { error: "Container not found." },
        { status: 404 },
      );
    }

    const invoices = await db.invoice.findMany({
      where: { containerId },
      // Cargo only — the packing list and unstuffing scan deal in physical
      // pieces; surcharge/tax/discount are money lines, not manifest items.
      include: { items: { where: { isCharge: false } } },
    });

    return NextResponse.json({ container, invoices }, { status: 200 });
  } catch (error) {
    // Log details server-side; send a generic message to the client
    console.error("❌ Cross-dock data fetch failure:", error);
    return NextResponse.json(
      { error: "Failed to load manifest data." },
      { status: 500 },
    );
  }
}