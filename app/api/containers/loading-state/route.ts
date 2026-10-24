// app/api/containers/loading-state/route.ts
// GET — powers "Save & Continue Later" on the loading terminal.
//   • no query          → list OPEN containers (status NULL) that have cargo
//                          loaded, for the resume picker.
//   • ?containerNumber=X → that open container's full loading state (setup
//                          fields + invoices with booked/loaded per item) so
//                          the terminal can rehydrate exactly where it left off.
// Origin-side only; the scan API still re-validates every write server-side.

import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/session";

const CARGO_ONLY = { where: { isCharge: false } } as const;

export async function GET(req: NextRequest) {
  // AuthN + AuthZ — loading is an origin-side action.
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["origin_admin", "super_admin"].includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const containerNumber = req.nextUrl.searchParams
    .get("containerNumber")
    ?.trim()
    .toUpperCase();

  try {
    // ── DETAIL: one open container's full loading state ────────────────────
    if (containerNumber) {
      const container = await db.container.findUnique({
        where: { id: containerNumber },
        select: {
          id: true,
          sealNumber: true, // origin admin set it at init and needs it to seal
          size: true,
          vessel: true,
          shippingLine: true,
          originCity: true,
          destinationCity: true,
          departureDate: true,
          eta: true,
          status: true,
          invoices: {
            select: {
              invoiceNumber: true,
              items: {
                ...CARGO_ONLY,
                select: { itemType: true, quantity: true, loadedQuantity: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      });

      if (!container) {
        return NextResponse.json(
          { error: "Container not found." },
          { status: 404 },
        );
      }
      if (container.status !== null) {
        return NextResponse.json(
          { error: "This container is already sealed and cannot be resumed." },
          { status: 409 },
        );
      }

      return NextResponse.json({
        container: {
          id: container.id,
          sealNumber: container.sealNumber,
          size: container.size,
          vessel: container.vessel,
          shippingLine: container.shippingLine,
          originCity: container.originCity,
          destinationCity: container.destinationCity,
          departureDate: container.departureDate.toISOString().slice(0, 10),
          eta: container.eta.toISOString().slice(0, 10),
        },
        invoices: container.invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          items: inv.items.map((it) => ({
            itemType: it.itemType,
            booked: it.quantity,
            loaded: it.loadedQuantity,
          })),
        })),
      });
    }

    // ── LIST: open containers with something loaded, for the picker ────────
    const containers = await db.container.findMany({
      where: { status: null, invoices: { some: {} } },
      select: {
        id: true,
        originCity: true,
        destinationCity: true,
        updatedAt: true,
        invoices: {
          select: {
            items: { ...CARGO_ONLY, select: { loadedQuantity: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const openContainers = containers.map((c) => ({
      id: c.id,
      originCity: c.originCity,
      destinationCity: c.destinationCity,
      updatedAt: c.updatedAt.toISOString(),
      invoiceCount: c.invoices.length,
      loadedPieces: c.invoices.reduce(
        (sum, inv) =>
          sum + inv.items.reduce((a, it) => a + it.loadedQuantity, 0),
        0,
      ),
    }));

    return NextResponse.json({ openContainers });
  } catch (error) {
    console.error("❌ loading-state failure:", error);
    return NextResponse.json(
      { error: "Failed to load container state." },
      { status: 500 },
    );
  }
}
