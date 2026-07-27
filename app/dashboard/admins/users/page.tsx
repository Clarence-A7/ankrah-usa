import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";
import StaffClient from "./StaffClient";

export default async function StaffPage() {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  // Matches the role list already gating the "Staff" link in Sidebar.tsx —
  // keep these in sync if that list ever changes.
  if (
    session.role !== "origin_admin" &&
    session.role !== "super_admin" &&
    session.role !== "destination_admin"
  ) {
    redirect("/unauthorized");
  }

  // Destination admins only see (and may only email) destination staff.
  const destinationScoped = session.role === "destination_admin";

  // password is deliberately excluded here — it must never leave the
  // server, hashed or not. If you add fields to this select later, keep
  // that exclusion explicit rather than switching to a bare findMany().
  const users = await db.user.findMany({
    where: destinationScoped
      ? { role: { in: ["destination_admin", "d_driver"] } }
      : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      staffId: true,
      phone: true,
      address: true,
      avatarUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const initialStaff = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return <StaffClient initialStaff={initialStaff} viewerRole={session.role} />;
}
