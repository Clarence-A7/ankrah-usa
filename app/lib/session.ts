import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SECRET_KEY } from "./auth-config";

const SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 hours — single source for both JWT + cookie expiry

export async function createSession(
  userId: string,
  email: string,
  role: string,
  staffId?: string | null
) {
  const token = await new SignJWT({ userId, email, role, staffId: staffId ?? null })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(SECRET_KEY);

  const cookieStore = await cookies();
  cookieStore.set("ankrah_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ankrah_session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: ["HS256"],
    });
    return payload as {
      userId: string;
      email: string;
      role: string;
      staffId: string | null;
    };
  } catch (error) {
    console.error("getSession: token verification failed:", error);
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("ankrah_session");
}