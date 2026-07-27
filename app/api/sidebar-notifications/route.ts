import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { getCurrentUserSession } from "@/app/actions/auth";

// Polled by Sidebar.tsx every 60s. Each category is its own db.count()
// call, scoped to whatever role actually needs to see it -- an
// unauthenticated or wrong-role request just gets an empty object rather
// than an error, since a missing badge is harmless but this endpoint
// firing shouldn't ever block navigation from rendering.
export async function GET() {
  const session = await getCurrentUserSession();
  if (!session || !session.id) {
    return NextResponse.json({});
  }

  const role = session.role;
  const counts: Record<string, number> = {};

  // Pickups: freshly-booked invoices not yet dispatched -- the exact same
  // status PickupsTableClient's default "Ready" tab already filters to.
  if (role === "origin_admin" || role === "super_admin") {
    counts.pickups = await db.invoice.count({
      where: { status: "Ready For Pickup" },
    });
  }

  // Vehicles: brand new quote requests, not yet contacted or quoted --
  // the exact same status VehicleQuotesTableClient's default "New" tab
  // already filters to.
  if (role === "origin_admin" || role === "super_admin") {
    counts.vehicles = await db.vehicleQuoteRequest.count({
      where: { status: "new" },
    });
  }

  // Payments: counted against THIS admin's own paymentsLastViewedAt, so
  // the badge clears the moment they open the Payments page and only
  // climbs again once new payments land after that. Never-viewed admins
  // fall back to a 24h window rather than showing every payment ever
  // logged as "new".
  if (role === "origin_admin" || role === "super_admin") {
    const adminProfile = await db.user.findUnique({
      where: { id: session.id },
      select: { paymentsLastViewedAt: true },
    });

    const since =
      adminProfile?.paymentsLastViewedAt ??
      new Date(Date.now() - 24 * 60 * 60 * 1000);

    counts.payments = await db.payments.count({
      where: { createdAt: { gt: since } },
    });
  }

  // Driver-scoped counts. staffId is fetched once for either driver role,
  // but each count below is gated on its OWN role -- my-pickups only ever
  // means something for o_driver, my-dispatch only ever means something
  // for d_driver. Previously both lived inside an `if (role ===
  // "o_driver")` block, which meant a d_driver's "My Dispatch" badge was
  // silently always empty since that block never ran for them.
  if (role === "o_driver" || role === "d_driver") {
    const driverProfile = await db.user.findUnique({
      where: { id: session.id },
      select: { staffId: true },
    });

    if (driverProfile?.staffId) {
      if (role === "o_driver") {
        counts["my-pickups"] = await db.invoice.count({
          where: {
            pickupDriver: driverProfile.staffId,
            status: "Pending Pickup",
          },
        });
      }

      if (role === "d_driver") {
        counts["my-dispatch"] = await db.invoice.count({
          where: {
            deliveryDriver: driverProfile.staffId,
            status: "Out For Delivery",
          },
        });
      }
    }
  }

  // Containers and Deliveries intentionally left out -- their "new"
  // definition depends on ContainersClient / DeliveriesClient logic that
  // hasn't been confirmed yet. Add them here following the exact same
  // db.<model>.count({ where: {...} }) pattern above once that's known.

  return NextResponse.json(counts);
}