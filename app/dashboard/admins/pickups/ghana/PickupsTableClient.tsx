"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table } from "../../../../components/ui/Table";
import Button from "../../../../components/ui/Button";
import styles from "../../../styles/dashboard.module.css";
import { InvoiceDetailsModal } from "../../../../components/InvoiceDetailsModal";
import { DispatchDriverModal } from "../../../../components/DispatchDriverModal";
import PrintInvoiceQRModal from "../../../../components/PrintInvoiceQRModal";
import MarkReceivedConfirmModal from "../../../../components/MarkReceivedConfirmModal";
import { useAutoRefresh } from "@/app/lib/hooks/useAutoRefresh";
import { Ship, Plane, Printer, PackageCheck } from "lucide-react";

// Mirrors the INVOICE_STATUS_PIPELINE / "at least" matching pattern your
// project notes describe as needing consolidation into a shared
// lib/invoice-status.ts. Duplicated here locally rather than guessed-imported
// from an unverified path — if that shared file already exists, swap this
// out for the real import. Returned To Hub is deliberately excluded: it's a
// sideways attention state, not a forward pipeline position, so it should
// never match an "at least" check regardless of where it'd numerically sit.
const PIPELINE_ORDER = [
  "Ready For Pickup",
  "Pending Pickup",
  "Collected",
  "Received At Origin",
  "In-Transit",
  "Arrived",
  "Cleared",
  "Received At Hub",
  "Out For Delivery",
  "Delivered",
] as const;

function isAtLeast(status: string, threshold: (typeof PIPELINE_ORDER)[number]) {
  const statusIdx = PIPELINE_ORDER.indexOf(
    status as (typeof PIPELINE_ORDER)[number],
  );
  const thresholdIdx = PIPELINE_ORDER.indexOf(threshold);
  return statusIdx !== -1 && statusIdx >= thresholdIdx;
}

function normalizeStatus(status: string): string {
  return status
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

const STATUS_TABS = [
  {
    key: "Ready For Pickup",
    label: "Ready",
    matches: (status: string) => status === "Ready For Pickup",
  },
  {
    key: "Pending Pickup",
    label: "Dispatched",
    matches: (status: string) => status === "Pending Pickup",
  },
  {
    key: "Collected",
    label: "Picked",
    matches: (status: string) => status === "Collected",
  },
  {
    key: "Received At Origin",
    label: "Received",
    // Received At Origin and everything further along the pipeline —
    // In-Transit, Arrived, Cleared, Received At Hub, Out For Delivery,
    // Delivered — but never Returned To Hub.
    matches: (status: string) => isAtLeast(status, "Received At Origin"),
  },
] as const;

type StatusKey = (typeof STATUS_TABS)[number]["key"];

interface ReceiveTarget {
  id: string;
  invoiceNumber: string;
}

interface QRTarget {
  invoiceNumber: string;
  items: { id: string; itemType: string; quantity: number }[];
}

export default function PickupsTableClient({
  invoicesData,
}: {
  invoicesData: any[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [dispatchTargetIds, setDispatchTargetIds] = useState<string[] | null>(
    null,
  );
  const [reassignTargetIds, setReassignTargetIds] = useState<string[] | null>(
    null,
  );
  const [qrPrintTargets, setQrPrintTargets] = useState<QRTarget[] | null>(null);
  const [receiveTargets, setReceiveTargets] = useState<ReceiveTarget[] | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<StatusKey>(STATUS_TABS[0].key);
  const [searchTerm, setSearchTerm] = useState("");

  // invoicesData is used directly below (not copied into its own useState),
  // so unlike ContainersClient this page needs no prop-sync effect —
  // router.refresh() handing down a fresh invoicesData prop is enough on
  // its own, since every derived value below is a useMemo keyed on it.
  // Paused while any of the five action modals are open, so a background
  // refresh never lands mid-dispatch, mid-reassign, mid-print, or
  // mid-confirmation.
  useAutoRefresh(() => router.refresh(), {
    intervalMs: 60_000,
    enabled:
      !selectedInvoice &&
      !dispatchTargetIds &&
      !reassignTargetIds &&
      !qrPrintTargets &&
      !receiveTargets,
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const matchesSearch = (row: any) => {
    if (!isSearching) return true;
    const haystack = [row.invoiceNumber, row.consignerName, row.consignerPhone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  };

  const searchedData = useMemo(
    () => invoicesData.filter(matchesSearch),
    [invoicesData, normalizedSearch],
  );

  const activeTabDef = STATUS_TABS.find((tab) => tab.key === activeTab)!;

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of STATUS_TABS) {
      counts[tab.key] = searchedData.filter((row) =>
        tab.matches(row.status),
      ).length;
    }
    return counts;
  }, [searchedData]);

  // While searching, ignore the tab filter so matches in other tabs aren't hidden.
  const filteredData = useMemo(
    () =>
      isSearching
        ? searchedData
        : searchedData.filter((row) => activeTabDef.matches(row.status)),
    [searchedData, activeTabDef, isSearching],
  );

  // Ready For Pickup invoices have no driver yet — showing an empty/N-D
  // Driver column for the whole tab is just noise. Still shown during a
  // cross-tab search, since results there can be a mix of statuses.
  const showDriverColumn = isSearching || activeTab !== "Ready For Pickup";

  const handleTabChange = (tabKey: StatusKey) => {
    setActiveTab(tabKey);
    setSelectedIds([]);
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredData.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredData.map((row) => row.id));
    }
  };

  const handleDispatchShipment = (id: string) => {
    setDispatchTargetIds([id]);
  };

  const handleBulkDispatch = () => {
    setDispatchTargetIds(selectedIds);
  };

  const handleDispatched = () => {
    setSelectedIds([]);
    router.refresh();
  };

  // Change the assigned driver on an already-dispatched (Pending Pickup) invoice
  const handleEditDriver = (id: string) => {
    const targetRow = invoicesData.find((row) => row.id === id);
    if (targetRow && targetRow.status === "Pending Pickup") {
      setReassignTargetIds([id]);
    }
  };

  const handleReassigned = () => {
    setReassignTargetIds(null);
    router.refresh();
  };

  const handleMarkReceived = (row: any) => {
    setReceiveTargets([{ id: row.id, invoiceNumber: row.invoiceNumber }]);
  };

  const handleBulkMarkReceived = () => {
    const targets = filteredData
      .filter((row) => selectedIds.includes(row.id))
      .map((row) => ({ id: row.id, invoiceNumber: row.invoiceNumber }));
    setReceiveTargets(targets);
  };

  const handleReceived = () => {
    setSelectedIds([]);
    router.refresh();
  };

  const handlePrintLabel = (row: any) => {
    setQrPrintTargets([
      { invoiceNumber: row.invoiceNumber, items: row.items || [] },
    ]);
  };

  const handleBulkPrintLabels = () => {
    const targets = filteredData
      .filter((row) => selectedIds.includes(row.id))
      .map((row) => ({
        invoiceNumber: row.invoiceNumber,
        items: row.items || [],
      }));
    setQrPrintTargets(targets);
  };

  const getPaymentStatusBadge = (amountDue: number, amountPaid: number) => {
    if (amountDue === 0) {
      return (
        <span
          className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
          style={{
            backgroundColor: "#f0fdf4",
            color: "#15803d",
            borderColor: "#bbf7d0",
          }}
        >
          Paid
        </span>
      );
    }
    if (amountDue > 0 && amountPaid > 0) {
      return (
        <span
          className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
          style={{
            backgroundColor: "#fff7ed",
            color: "#c2410c",
            borderColor: "#fed7aa",
          }}
        >
          Partial
        </span>
      );
    }
    return (
      <span
        className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
        style={{
          backgroundColor: "#fef2f2",
          color: "#b91c1c",
          borderColor: "#fecaca",
        }}
      >
        Unpaid
      </span>
    );
  };

  const STATUS_BADGE_COLORS: Record<
    string,
    { bg: string; text: string; border: string }
  > = {
    "Received At Origin": { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
    "In-Transit": { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
    Arrived: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
    Cleared: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
    "Received At Hub": { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
    "Out For Delivery": { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" },
    Delivered: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  };

  const getStatusBadge = (status: string) => {
    const colors = STATUS_BADGE_COLORS[status] || {
      bg: "#f3f4f6",
      text: "#374151",
      border: "#e5e7eb",
    };
    return (
      <span
        className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          borderColor: colors.border,
        }}
      >
        {status}
      </span>
    );
  };

  // Action buttons only make sense within a single, homogeneous queue
  // (Ready/Dispatched/Picked). The Received tab spans seven different
  // pipeline statuses, and a cross-tab search can mix statuses too — in
  // both cases a "Dispatch" or "Edit Driver" button would be actively
  // wrong for most rows shown, so Status replaces Action there instead.
  const showStatusColumn = isSearching || activeTab === "Received At Origin";

  const columns = [
    {
      header: (
        <input
          type="checkbox"
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          checked={
            filteredData.length > 0 &&
            selectedIds.length === filteredData.length
          }
          onChange={handleSelectAll}
        />
      ),
      render: (row: any) => (
        <div className="flex justify-center items-center w-full">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            checked={selectedIds.includes(row.id)}
            onChange={() => handleSelectRow(row.id)}
          />
        </div>
      ),
    },
    {
      header: "Invoice",
      render: (row: any) => (
        <button
          className={styles.linkButton}
          onClick={() => setSelectedInvoice(row)}
        >
          {row.invoiceNumber}
        </button>
      ),
    },
    { header: "Consigner", render: (row: any) => row.consignerName },
    { header: "Contact", render: (row: any) => row.consignerPhone },
    {
      header: "Route",
      render: (row: any) => (
        <>
          {row.pickupCity}, {row.pickupState} → <br />
          {row.destinationCity}
        </>
      ),
    },
    {
      header: "Mode",
      render: (row: any) => {
        const mode = row.shipmentMode?.toUpperCase();
        if (mode === "OCEAN") {
          return (
            <div
              className="flex items-center justify-center text-blue-600 w-full"
              title="Ocean Freight"
            >
              <Ship size={18} strokeWidth={2.5} />
            </div>
          );
        }
        if (mode === "AIR") {
          return (
            <div
              className="flex items-center justify-center text-indigo-600 w-full"
              title="Air Freight"
            >
              <Plane size={18} strokeWidth={2.5} className="rotate-45" />
            </div>
          );
        }
        return (
          <div className="text-center text-gray-400 font-mono text-xs w-full">
            {row.shipmentMode || "—"}
          </div>
        );
      },
    },
    {
      header: "Payment Status",
      render: (row: any) => {
        const due = Number(row.amountDue || 0);
        const paid = Number(row.amountPaid || 0);
        return getPaymentStatusBadge(due, paid);
      },
    },
    ...(showDriverColumn
      ? [
          {
            header: "Driver",
            render: (row: any) => row.driverName || "N/D",
          },
        ]
      : []),
    {
      header: showStatusColumn ? "Status" : "Action",
      render: (row: any) => {
        if (showStatusColumn) {
          return getStatusBadge(row.status);
        }
        if (row.status === "Received At Origin") {
          return (
            <Button
              className={styles.actionBtn}
              onClick={() => handlePrintLabel(row)}
            >
              <Printer size={14} style={{ marginRight: "0.25rem" }} />
              Label
            </Button>
          );
        }
        if (row.status === "Collected") {
          return (
            <Button
              className={styles.actionBtn}
              onClick={() => handleMarkReceived(row)}
            >
              <PackageCheck size={14} style={{ marginRight: "0.25rem" }} />
              Mark as Received
            </Button>
          );
        }
        if (row.status === "Pending Pickup") {
          return (
            <Button
              className={styles.actionBtn}
              onClick={() => handleEditDriver(row.id)}
            >
              Edit Driver
            </Button>
          );
        }
        return (
          <Button
            className={styles.actionBtn}
            onClick={() => handleDispatchShipment(row.id)}
          >
            Dispatch
          </Button>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ padding: "2rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            color: "#2e63af",
            margin: "0 0 0.5rem 0",
          }}
        >
          Pickups{" "}
          <span className={styles.titleCount}>
            ({filteredData.length} Active)
          </span>
        </h1>

        <div className={styles.actionControls}>
          <div
            role="tablist"
            aria-label="Filter by status"
            style={{
              display: "flex",
              gap: "0.5rem",
              borderBottom: "1px solid #e5e7eb",
              margin: "1rem 0",
              opacity: isSearching ? 0.5 : 1,
              pointerEvents: isSearching ? "none" : "auto",
            }}
          >
            {STATUS_TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.625rem 0.875rem",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    background: "none",
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid #2563eb"
                      : "2px solid transparent",
                    color: isActive ? "#2563eb" : "#6b7280",
                    cursor: "pointer",
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                >
                  {tab.label}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      padding: "0.0625rem 0.4375rem",
                      borderRadius: "9999px",
                      backgroundColor: isActive ? "#dbeafe" : "#f3f4f6",
                      color: isActive ? "#2563eb" : "#6b7280",
                    }}
                  >
                    {tabCounts[tab.key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedIds.length > 0 && activeTab === "Collected" && (
            <Button
              variant="primary"
              onClick={handleBulkMarkReceived}
              className={styles.bulkMarkReceivedBtn}
            >
              <PackageCheck size={14} style={{ marginRight: "0.25rem" }} />
              Mark as Received ({selectedIds.length})
            </Button>
          )}

          {selectedIds.length > 0 && activeTab === "Received At Origin" && (
            <Button
              variant="primary"
              onClick={handleBulkPrintLabels}
              className={styles.bulkLabelBtn}
            >
              <Printer size={14} style={{ marginRight: "0.25rem" }} />
              Label Selected ({selectedIds.length})
            </Button>
          )}

          {selectedIds.length > 0 &&
            activeTab !== "Collected" &&
            activeTab !== "Received At Origin" && (
              <Button
                variant="primary"
                onClick={handleBulkDispatch}
                className={styles.bulkDispatchBtn}
              >
                Dispatch Selected ({selectedIds.length})
              </Button>
            )}

          <input
            type="text"
            placeholder="Search by invoice #, consigner, or phone"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {isSearching && (
            <Button
              onClick={() => setSearchTerm("")}
              className={styles.clearBtn}
              type="button"
            >
              Clear search
            </Button>
          )}
        </div>

        {isSearching && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "#6b7280",
              margin: "0.5rem 0 0",
            }}
          >
            Showing {filteredData.length} result
            {filteredData.length === 1 ? "" : "s"} for &quot;{searchTerm}
            &quot; across all statuses
          </p>
        )}
      </div>

      <div className={styles.tableWrapper}>
        <Table columns={columns} data={filteredData} />
      </div>

      <InvoiceDetailsModal
        isOpen={selectedInvoice !== null}
        container={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />

      <DispatchDriverModal
        isOpen={dispatchTargetIds !== null}
        invoiceIds={dispatchTargetIds || []}
        onClose={() => setDispatchTargetIds(null)}
        onDispatched={handleDispatched}
      />

      {/* Reassign: edits the driver on an already-dispatched (Pending Pickup) invoice */}
      <DispatchDriverModal
        isOpen={reassignTargetIds !== null}
        invoiceIds={reassignTargetIds || []}
        mode="reassign"
        onClose={() => setReassignTargetIds(null)}
        onDispatched={handleReassigned}
      />

      {qrPrintTargets && qrPrintTargets.length > 0 && (
        <PrintInvoiceQRModal
          invoices={qrPrintTargets}
          onClose={() => setQrPrintTargets(null)}
        />
      )}

      <MarkReceivedConfirmModal
        isOpen={receiveTargets !== null}
        targets={receiveTargets || []}
        onClose={() => setReceiveTargets(null)}
        onReceived={handleReceived}
      />
    </>
  );
}
