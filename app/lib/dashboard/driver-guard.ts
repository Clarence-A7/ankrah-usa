import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

export type DriverRole = "o_driver" | "d_driver";

const ALLOWED_DRIVER_ROLES: readonly DriverRole[] = ["o_driver", "d_driver"];

export interface AuthorizedDriverSession {
  userId: string;
  role: DriverRole;
  staffId: string;
}

type DriverGuardResult =
  | { ok: true; session: AuthorizedDriverSession }
  | { ok: false; response: NextResponse };

/**
 * Deliberately separate from requireDashboardAccess (app/lib/dashboard/guard.ts).
 * Drivers are not admin-dashboard roles and must never be able to reach
 * admin-scoped queries, and admins hitting this endpoint must not get a
 * driver's (empty) view either — the two guards are not interchangeable.
 *
 * Every driver-metrics query downstream filters on `staffId`. If staffId
 * is missing from the session, there is no safe way to scope a query, so
 * this fails closed (403) rather than ever returning unscoped data or
 * silently falling back to "show nothing" in a way that could be mistaken
 * for "this driver has no stops today."
 */
export async function requireDriverAccess(): Promise<DriverGuardResult> {
  let session: Awaited<ReturnType<typeof getSession>>;

  try {
    session = await getSession();
  } catch (err) {
    console.error("[dashboard/driver-guard] session lookup failed", err);
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!session?.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!ALLOWED_DRIVER_ROLES.includes(session.role as DriverRole)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (!session.staffId) {
    console.error(
      `[dashboard/driver-guard] driver session for userId=${session.userId} has no staffId — refusing to serve unscoped metrics`
    );
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    session: {
      userId: session.userId,
      role: session.role as DriverRole,
      staffId: session.staffId,
    },
  };
}