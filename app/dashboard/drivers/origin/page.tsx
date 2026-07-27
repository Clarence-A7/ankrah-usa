import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import DriverOverview from "@/app/components/DriverOverview";

// Mirrors the admin dashboard page's pattern: this page-level check is in
// addition to (not a replacement for) requireDriverAccess() inside
// /api/dashboard/driver-metrics — this one keeps an unauthorized visitor
// from ever receiving the component tree, the API guard protects the data.
//
// Scoped specifically to o_driver, not "any driver" — a d_driver hitting
// this URL should bounce, the same way they'd bounce from the origin
// admin's pickup tools.
export default async function OriginDriverPage() {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  if (session.role !== "o_driver") {
    redirect("/unauthorized");
  }

  return <DriverOverview />;
}
