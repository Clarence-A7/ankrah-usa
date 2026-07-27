import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SECRET_KEY } from "@/app/lib/auth-config";

type Role =
  | "origin_admin"
  | "destination_admin"
  | "super_admin"
  | "o_driver"
  | "d_driver";

const ROLE_HOME: Record<Role, string> = {
  super_admin: "/dashboard/admins/origin",
  origin_admin: "/dashboard/admins/origin",
  destination_admin: "/dashboard/admins/destination",
  o_driver: "/dashboard/drivers/origin",
  d_driver: "/dashboard/drivers/destination",
};

function homeFor(role: string | undefined): string {
  return ROLE_HOME[role as Role] ?? "/";
}

interface SessionPayload {
  userId: string;
  email: string;
  role: string;
}

async function verifySession(sessionCookie: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(sessionCookie, SECRET_KEY, {
    algorithms: ["HS256"],
  });
  return {
    userId: payload.userId as string,
    email: payload.email as string,
    role: payload.role as string,
  };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get("ankrah_session")?.value;

  if (pathname.startsWith("/dashboard")) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    let session: SessionPayload;
    try {
      session = await verifySession(sessionCookie);
    } catch (err) {
      console.error("Middleware: session verification failed:", err);
      const res = NextResponse.redirect(new URL("/", request.url));
      res.cookies.delete("ankrah_session");
      return res;
    }

    const { role: userRole } = session;

    if (!userRole || !(userRole in ROLE_HOME)) {
      console.error("Middleware: unrecognized role on token:", userRole);
      const res = NextResponse.redirect(new URL("/", request.url));
      res.cookies.delete("ankrah_session");
      return res;
    }

    if (
      pathname.startsWith("/dashboard/admins/origin") &&
      userRole !== "origin_admin" &&
      userRole !== "super_admin"
    ) {
      return NextResponse.redirect(new URL(homeFor(userRole), request.url));
    }

    if (
      pathname.startsWith("/dashboard/admins/destination") &&
      userRole !== "destination_admin" &&
      userRole !== "super_admin"
    ) {
      return NextResponse.redirect(new URL(homeFor(userRole), request.url));
    }

    if (
      pathname.startsWith("/dashboard/admins") &&
      userRole !== "super_admin" &&
      userRole !== "origin_admin" &&
      userRole !== "destination_admin"
    ) {
      return NextResponse.redirect(new URL(homeFor(userRole), request.url));
    }

    if (
      pathname.startsWith("/dashboard/drivers/origin") &&
      userRole !== "o_driver" &&
      userRole !== "super_admin"
    ) {
      return NextResponse.redirect(new URL(homeFor(userRole), request.url));
    }

    if (
      pathname.startsWith("/dashboard/drivers/destination") &&
      userRole !== "d_driver" &&
      userRole !== "super_admin"
    ) {
      return NextResponse.redirect(new URL(homeFor(userRole), request.url));
    }

    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      return NextResponse.redirect(new URL(homeFor(userRole), request.url));
    }

    return NextResponse.next();
  }

  if (pathname === "/") {
    if (sessionCookie) {
      try {
        const session = await verifySession(sessionCookie);
        return NextResponse.redirect(new URL(homeFor(session.role), request.url));
      } catch (err) {
        console.error("Middleware: invalid token on login page check:", err);
        const res = NextResponse.next();
        res.cookies.delete("ankrah_session");
        return res;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*"],
};