"use server";

import { getSession, deleteSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";

interface UserSession {
  id: string;
  email: string;
  role: string;
  staffId: string | null;
  name: string;
  avatarUrl: string | null;
}

export async function getCurrentUserSession(): Promise<UserSession | null> {
  const session = await getSession();
  if (!session) return null;

  // The JWT deliberately only carries userId/email/role/staffId — it never
  // held avatarUrl, since a base64 photo can run past 2MB and cookies have
  // a hard ~4KB limit. name and avatarUrl are looked up fresh here instead,
  // so both always reflect whatever was last saved via the Staff edit form
  // rather than a stale or derived value.
  const dbUser = await db.user.findUnique({
    where: { id: session.userId },
    select: { name: true, avatarUrl: true },
  });

  // The account could have been deleted after this JWT was issued but
  // before it expired — fail closed rather than fabricating an identity
  // for a user record that no longer exists.
  if (!dbUser) return null;

  return {
    id: session.userId,
    email: session.email,
    role: session.role,
    staffId: session.staffId,
    name: dbUser.name,
    avatarUrl: dbUser.avatarUrl,
  };
}

export async function logoutUserSession() {
  await deleteSession();
}