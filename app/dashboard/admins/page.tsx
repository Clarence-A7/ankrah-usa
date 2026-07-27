import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import DashboardOverview from "@/app/components/DashboardOverview";

// Server-side gate for the page itself. This is deliberately separate from
// (and in addition to) the guard inside /api/dashboard/metrics — the API
// guard protects the data, this one protects the route/page shell so an
// unauthorized visitor never even receives the component tree.
export default async function DashboardPage() {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    redirect("/unauthorized");
  }

  return <DashboardOverview />;
}
