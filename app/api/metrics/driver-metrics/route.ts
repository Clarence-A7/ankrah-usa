import { NextResponse } from "next/server";
import { requireDriverAccess, type DriverRole } from "../../../lib/dashboard/driver-guard";
import {
  getOriginDriverMetrics,
  getDestinationDriverMetrics,
  type OriginDriverMetrics,
  type DestinationDriverMetrics,
} from "../../../lib/dashboard/driver-metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadMetricsForDriver(
  role: DriverRole,
  staffId: string
): Promise<OriginDriverMetrics | DestinationDriverMetrics> {
  switch (role) {
    case "o_driver":
      return getOriginDriverMetrics(staffId);
    case "d_driver":
      return getDestinationDriverMetrics(staffId);
    default: {
      const _exhaustive: never = role;
      throw new Error(`Unhandled driver role: ${_exhaustive}`);
    }
  }
}

export async function GET() {
  const auth = await requireDriverAccess();
  if (!auth.ok) return auth.response;

  try {
    const data = await loadMetricsForDriver(auth.session.role, auth.session.staffId);

    return NextResponse.json(
      { data },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (err) {
    console.error("[dashboard/driver-metrics] failed to load metrics", err);
    return NextResponse.json(
      { error: "Failed to load driver metrics" },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}