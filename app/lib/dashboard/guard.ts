import "server-only";
import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

export type DashboardRole = "super_admin" | "origin_admin" | "destination_admin";

/**
 * Only these roles may reach dashboard metrics at all. o_driver and
 * d_driver are intentionally excluded — if they need their own overview
 * later, give them a dedicated endpoint with its own scoped query set
 * rather than widening this list.
 */
const ALLOWED_ROLES: readonly DashboardRole[] = [
  "super_admin",
  "origin_admin",
  "destination_admin",
];

export interface AuthorizedSession {
  userId: string;
  role: DashboardRole;
}

type GuardResult =
  | { ok: true; session: AuthorizedSession }
  | { ok: false; response: NextResponse };

/**
 * Call this first, on every dashboard route, before touching Prisma.
 * Fails closed: any missing/malformed session or disallowed role is a
 * rejection, never a fallback to a "safe default" scope.
 */
export async function requireDashboardAccess(): Promise<GuardResult> {
  let session: Awaited<ReturnType<typeof getSession>>;

  try {
    session = await getSession();
  } catch (err) {
    console.error("[dashboard/guard] session lookup failed", err);
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

  if (!ALLOWED_ROLES.includes(session.role as DashboardRole)) {
    // 403, not 404 — the resource exists, the caller just isn't entitled
    // to it. Do not include the caller's actual role or any hint about
    // what would have been allowed in the response body.
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    session: { userId: session.userId, role: session.role as DashboardRole },
  };
}