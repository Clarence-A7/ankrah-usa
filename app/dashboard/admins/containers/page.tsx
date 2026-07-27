// app/dashboard/admins/containers/page.tsx
import React from "react";
import ContainersClient from "./ContainersClient";
import { getContainersForDashboard } from "../../../actions/containers";

// Bypasses Next.js static component caching to display newly added manifests instantly
export const dynamic = "force-dynamic";

export default async function ContainersPage() {
  // 1. Fetch real-time aggregated data straight from MySQL
  const liveContainerRecords = await getContainersForDashboard();

  // 2. Feed it into your interactive client view layout
  return <ContainersClient initialContainers={liveContainerRecords} />;
}
