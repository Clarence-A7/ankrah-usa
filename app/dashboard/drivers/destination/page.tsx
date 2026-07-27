import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import DriverOverview from "@/app/components/DriverOverview";

// Same pattern as origin-driver-page.tsx, scoped to d_driver instead.
export default async function DestinationDriverPage() {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  if (session.role !== "d_driver") {
    redirect("/unauthorized");
  }

  return <DriverOverview />;
}
