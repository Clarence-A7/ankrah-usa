// app/dashboard/admins/containers/ContainersClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/providers/AuthProvider";
import { Table } from "../../../components/ui/Table";
import { Badge } from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import { ContainerDetailsModal } from "../../../components/ContainerDetailsModal";
import { ArrivalConfirmModal } from "../../../components/ArrivalConfirmModal";
import { useAutoRefresh } from "@/app/lib/hooks/useAutoRefresh";
import type { BadgeVariant } from "../../../components/ui/Badge";
import type { ContainerData } from "@/app/lib/dashboard/container-types";
import styles from "../../styles/dashboard.module.css";

interface ContainersClientProps {
  initialContainers: ContainerData[];
}

export default function ContainersClient({
  initialContainers,
}: ContainersClientProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [containers, setContainers] =
    useState<ContainerData[]>(initialContainers);
  const [selectedContainer, setSelectedContainer] =
    useState<ContainerData | null>(null);

  const [arrivalModalContainerId, setArrivalModalContainerId] = useState<
    string | null
  >(null);

  // Fallback for the rare case a browser blocks the tab opened right after
  // the mark-arrived fetch resolves (mainly Safari). Rather than silently
  // losing the navigation, we surface a manual link the admin can click —
  // that click is its own fresh user gesture, so it's never blocked.
  const [blockedTab, setBlockedTab] = useState<{
    containerId: string;
    url: string;
  } | null>(null);

  // useState(initialContainers) only reads this value on mount — it won't
  // pick up a fresh array on its own just because the parent server
  // component re-rendered with new props. Without this, auto-refresh below
  // would re-query the DB every interval and the table would still show
  // stale data.
  useEffect(() => {
    setContainers(initialContainers);
  }, [initialContainers]);

  // This page has no client-side fetch of its own — data arrives as props
  // from the server component that renders it. router.refresh() re-runs
  // that server component (and its DB query) and hands down fresh props,
  // which the effect above then syncs into local state. Paused while
  // either modal is open, purely so the table underneath doesn't visibly
  // shift while someone's focused on a specific container.
  useAutoRefresh(() => router.refresh(), {
    intervalMs: 60_000,
    enabled: !selectedContainer && !arrivalModalContainerId,
  });

  // 1. Defend layout presentation rules from execution jumps while session verifies
  if (isLoading) {
    return (
      <div className={styles.loadingWrapper}>
        Synchronizing terminal data matrix...
      </div>
    );
  }

  if (!user) return null;

  const isDestAdmin = ["destination_admin", "super_admin"].includes(user.role);

  const openPackingList = (containerId: string): boolean => {
    const url = `/dashboard/admins/manifests/${containerId}`;
    const tab = window.open(url, "_blank", "noopener,noreferrer");
    if (!tab) {
      // Blocked — surface a manual fallback instead of failing silently.
      setBlockedTab({ containerId, url });
      return false;
    }
    return true;
  };

  const handlePackingListClick = (item: ContainerData) => {
    const isInTransit =
      item.status === "In-Transit" || (item.status as string) === "In_Transit";

    // Only destination admins get asked, and only while it's still
    // meaningful to ask — once a container has moved past In-Transit,
    // arrival is already settled.
    if (!isDestAdmin || !isInTransit) {
      openPackingList(item.id);
      return;
    }

    // Stay on this page — just open the confirmation modal. No tab is
    // opened yet, so there's nothing to steal focus or redirect anywhere.
    setBlockedTab(null);
    setArrivalModalContainerId(item.id);
  };

  const handleArrivalResolved = (
    containerId: string,
    result: { arrived: boolean },
  ) => {
    if (result.arrived) {
      setContainers((prev) =>
        prev.map((c) =>
          c.id === containerId ? { ...c, status: "Arrived" } : c,
        ),
      );
    }

    setArrivalModalContainerId(null);
    // This click chain is either fully synchronous ("Not yet") or follows
    // one fetch ("Yes" + date confirmed) — both count as a direct response
    // to the modal button click in most browsers. openPackingList already
    // handles the rare block case via the fallback link.
    openPackingList(containerId);
  };

  const handleArrivalModalClose = () => {
    setArrivalModalContainerId(null);
  };

  const allColumns = [
    {
      header: "Container#",
      render: (item: ContainerData) => (
        <button
          className={styles.linkButton}
          onClick={() => setSelectedContainer(item)}
        >
          {item.id}
        </button>
      ),
    },
    { header: "Size", render: (item: ContainerData) => `${item.size}ft` },
    { header: "Vessel", render: (item: ContainerData) => item.vessel },
    { header: "Invoices", render: (item: ContainerData) => item.totalInvoices },

    { header: "ETA", render: (item: ContainerData) => item.eta },
    {
      header: "Est. Revenue",
      hideForRoles: ["destination_admin"],
      render: (item: ContainerData) => item.revenue,
    },
    {
      header: "Payments",
      hideForRoles: ["destination_admin"],
      render: (item: ContainerData) => item.collectedRevenue,
    },
    {
      header: "Status",
      render: (item: ContainerData) => {
        const variantMap: Record<string, BadgeVariant> = {
          Booked: "transit",
          Collected: "transit",
          Containerized: "transit",
          "In-Transit": "transit",
          Arrived: "arrived",
          Cleared: "cleared",
          Delivered: "completed",
        };

        return (
          <Badge variant={variantMap[item.status] || "transit"}>
            {item.status}
          </Badge>
        );
      },
    },
    {
      header: "Action",
      render: (item: ContainerData) => (
        <Button
          variant="primary"
          className={styles.packingListBtn}
          onClick={() => handlePackingListClick(item)}
        >
          Packing List
        </Button>
      ),
    },
  ];

  // 2. Filter custom data table columns using the real verified session role
  const visibleColumns = allColumns.filter(
    (col) => !col.hideForRoles || !col.hideForRoles.includes(user.role),
  );

  const handleCreateContainer = () => {
    router.push("/dashboard/admins/containers/loading");
  };

  const canCreateContainer =
    user.role === "origin_admin" || user.role === "super_admin";

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>
          Containers{" "}
          <span className={styles.titleCount}>
            ({containers.length} Active)
          </span>
        </h1>

        <div className={styles.actionControls}>
          <input
            type="text"
            placeholder="Container Search"
            className={styles.searchInput}
          />
          <select className={styles.filterSelect} defaultValue="">
            <option value="" disabled>
              Status Filter
            </option>
            <option value="Booked">Booked</option>
            <option value="Collected">Collected</option>
            <option value="Containerized">Containerized</option>
            <option value="In-Transit">In-Transit</option>
            <option value="Arrived">Arrived</option>
            <option value="Cleared">Cleared</option>
            <option value="Delivered">Delivered</option>
          </select>

          <Button variant="primary" className={styles.filterBtn}>
            Filter
          </Button>
        </div>
      </div>

      {blockedTab && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            background: "#fef7e0",
            color: "#7a5d00",
            borderRadius: "6px",
            fontSize: "0.9rem",
          }}
        >
          <span>
            Your browser blocked the new tab for {blockedTab.containerId}.
          </span>
          <a
            href={blockedTab.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setBlockedTab(null)}
            style={{
              fontWeight: 600,
              color: "#1a73e8",
              textDecoration: "underline",
            }}
          >
            Open Packing List
          </a>
        </div>
      )}

      {/* Main Datatable Frame fed with live database results */}
      <Table columns={visibleColumns} data={containers} />

      {/* Floating Action Guarded by Context State */}
      {canCreateContainer && (
        <Button
          variant="accent"
          className={styles.floatingActionBtn}
          onClick={handleCreateContainer}
          title="Add New Container"
        >
          <Plus className={styles.fabIcon} />
          <span>Add</span>
        </Button>
      )}

      {/* Detail overlay engine automatically processing its internal context roles */}
      <ContainerDetailsModal
        isOpen={Boolean(selectedContainer)}
        container={selectedContainer}
        onClose={() => setSelectedContainer(null)}
      />

      <ArrivalConfirmModal
        isOpen={Boolean(arrivalModalContainerId)}
        containerId={arrivalModalContainerId || ""}
        onResolved={(result) =>
          arrivalModalContainerId &&
          handleArrivalResolved(arrivalModalContainerId, result)
        }
        onClose={handleArrivalModalClose}
      />
    </div>
  );
}
