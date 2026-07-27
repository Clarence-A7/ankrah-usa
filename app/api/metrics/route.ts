import { NextResponse } from "next/server";
import { requireDashboardAccess, type DashboardRole } from "../../lib/dashboard/guard";
import {
  getSuperAdminMetrics,
  getOriginAdminMetrics,
  getDestinationAdminMetrics,
  type SuperAdminMetrics,
  type OriginAdminMetrics,
  type DestinationAdminMetrics,
} from "../../lib/dashboard/metrics";

// Always compute fresh — this route returns per-user-scoped, near-real-time
// operational data and must never be served from a shared/edge cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Exhaustive dispatch by role. The `never` branch means: if DashboardRole
 * ever gains a member without a case here, this file fails to compile
 * instead of silently falling through to the wrong scope's data at
 * runtime. When you add a role to guard.ts's ALLOWED_ROLES, TypeScript
 * will force you back to this function.
 */
async function loadMetricsForRole(
  role: DashboardRole
): Promise<SuperAdminMetrics | OriginAdminMetrics | DestinationAdminMetrics> {
  switch (role) {
    case "super_admin":
      return getSuperAdminMetrics();
    case "origin_admin":
      return getOriginAdminMetrics();
    case "destination_admin":
      return getDestinationAdminMetrics();
    default: {
      const _exhaustive: never = role;
      throw new Error(`Unhandled dashboard role: ${_exhaustive}`);
    }
  }
}

export async function GET() {
  const auth = await requireDashboardAccess();
  if (!auth.ok) return auth.response;

  try {
    const data = await loadMetricsForRole(auth.session.role);

    return NextResponse.json(
      { data },
      {
        status: 200,
        headers: {
          // Belt-and-suspenders on top of `dynamic`/`revalidate`: forbids
          // any intermediary (CDN, browser back-forward cache, proxy) from
          // storing a response that's scoped to this session's role.
          "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (err) {
    // Log full detail server-side only. The client never sees stack traces,
    // query shapes, or Prisma error internals.
    console.error("[dashboard/metrics] failed to load metrics", err);
    return NextResponse.json(
      { error: "Failed to load dashboard metrics" },
      { status: 500 }
    );
  }
}

// Explicitly reject any other verb instead of letting Next fall through to
// a default 405 with a generic body — keeps behavior obvious and auditable.
export async function POST() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}