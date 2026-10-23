"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table } from "../../../components/ui/Table";
import Button from "../../../components/ui/Button";
import styles from "../../styles/dashboard.module.css";
import { InvoiceDetailsModal } from "../../../components/InvoiceDetailsModal";
import { DispatchDriverModal } from "../../../components/DesDriverDispatchModal";
import { useAutoRefresh } from "@/app/lib/hooks/useAutoRefresh";
import { Ship, Plane, Camera } from "lucide-react";
import PodViewerModal from "../../../components/PodViewerModal";

// Each tab can cover more than one status; "Ready" holds everything
// physically at the hub, whether newly received or returned by a driver.
const STATUS_TABS = [
  {
    id: "ready",
    label: "Ready",
    statuses: ["Received At Hub", "Returned To Hub"],
  },
  { id: "dispatched", label: "Dispatched", statuses: ["Out For Delivery"] },
  { id: "completed", label: "Completed", statuses: ["Delivered"] },
] as const;

type TabId = (typeof STATUS_TABS)[number]["id"];

const DISPATCHABLE_STATUSES: string[] = ["Received At Hub", "Returned To Hub"];
const REASSIGNABLE_STATUS = "Out For Delivery";

// An invoice can only be dispatched when it's at the hub AND fully paid
const isDispatchable = (row: any) =>
  DISPATCHABLE_STATUSES.includes(row.status) &&
  Number(row.amountDue || 0) === 0;

export default function DeliveryTableClient({
  invoicesData,
}: {
  invoicesData: any[];
}) {
  const router = useRouter();

  // Track selected rows by database ID for easy table checkbox matching
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [podTarget, setPodTarget] = useState<{ id: string; invoiceNumber: string } | null>(null);

  // Explicitly collect Invoice Numbers to send to the Dispatch modal
  const [dispatchTargetNumbers, setDispatchTargetNumbers] = useState<
    string[] | null
  >(null);

  // Invoice numbers whose driver is being changed (Out For Delivery only)
  const [reassignTargetNumbers, setReassignTargetNumbers] = useState<
    string[] | null
  >(null);

  const [activeTabId, setActiveTabId] = useState<TabId>(STATUS_TABS[0].id);
  const [searchTerm, setSearchTerm] = useState("");

  const activeTab = STATUS_TABS.find((tab) => tab.id === activeTabId)!;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const matchesSearch = (row: any) => {
    if (!isSearching) return true;
    const haystack = [
      row.invoiceNumber,
      row.consignerName,
      row.consignerPhone,
      row.consigneeName,
      row.consigneePhone,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  };

  const searchedData = useMemo(
    () => invoicesData.filter(matchesSearch),
    [invoicesData, normalizedSearch],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of STATUS_TABS) {
      counts[tab.id] = searchedData.filter((row) =>
        (tab.statuses as readonly string[]).includes(row.status),
      ).length;
    }
    return counts;
  }, [searchedData]);

  const filteredData = useMemo(() => {
    const rows = isSearching
      ? searchedData
      : searchedData.filter((row) =>
          (activeTab.statuses as readonly string[]).includes(row.status),
        );
    // Returned packages float to the top — they already failed a delivery
    // attempt and should be triaged first, not buried in the queue.
    return [...rows].sort((a, b) => {
      const aReturned = a.status === "Returned To Hub" ? 0 : 1;
      const bReturned = b.status === "Returned To Hub" ? 0 : 1;
      return aReturned - bReturned;
    });
  }, [searchedData, activeTab, isSearching]);

  const allSelected =
    filteredData.length > 0 &&
    filteredData.every((row) => selectedIds.includes(row.id));

  // Among the current selection, only these can actually be dispatched
  // (at hub AND fully paid)
  const selectedDispatchable = useMemo(
    () =>
      filteredData.filter(
        (row) =>
          selectedIds.includes(row.id) &&
          isDispatchable(row) &&
          row.invoiceNumber,
      ),
    [filteredData, selectedIds],
  );

  const handleTabChange = (tabId: TabId) => {
    setActiveTabId(tabId);
    setSelectedIds([]);
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredData.map((row) => row.id));
    }
  };

  // Look up the row object to capture the real invoiceNumber string value
  const handleDispatchShipment = (id: string) => {
    const targetRow = invoicesData.find((row) => row.id === id);
    if (targetRow?.invoiceNumber && isDispatchable(targetRow)) {
      setDispatchTargetNumbers([targetRow.invoiceNumber]);
    }
  };

  // Change the assigned driver on an already-dispatched invoice
  const handleEditDriver = (id: string) => {
    const targetRow = invoicesData.find((row) => row.id === id);
    if (targetRow?.invoiceNumber && targetRow.status === REASSIGNABLE_STATUS) {
      setReassignTargetNumbers([targetRow.invoiceNumber]);
    }
  };

  // Dispatch only the eligible invoices from the selection
  const handleBulkDispatch = () => {
    if (selectedDispatchable.length === 0) return;
    setDispatchTargetNumbers(
      selectedDispatchable.map((row) => row.invoiceNumber),
    );
  };

  const handleDispatched = () => {
    setSelectedIds([]);
    setDispatchTargetNumbers(null);
    router.refresh();
  };

  const handleReassigned = () => {
    setReassignTargetNumbers(null);
    router.refresh();
  };

  const formatDue = (amount: number) =>
    `$${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const columns = [
    {
      header: (
        <input
          type="checkbox"
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          checked={allSelected}
          disabled={filteredData.length === 0}
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
            aria-label={`Select invoice ${row.invoiceNumber}`}
          />
        </div>
      ),
    },
    {
      header: "Invoice #",
      render: (row: any) => (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          <button
            className={styles.linkButton}
            onClick={() => setSelectedInvoice(row)}
          >
            {row.invoiceNumber}
          </button>
          {row.status === "Returned To Hub" && (
            <span
              title="This package was returned to the hub after a failed delivery attempt"
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                padding: "0.0625rem 0.4375rem",
                borderRadius: "9999px",
                backgroundColor: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                whiteSpace: "nowrap",
              }}
            >
              R
            </span>
          )}
        </div>
      ),
    },
    {
      header: "Container",
      render: (row: any) => row.containerId,
    },
    { header: "Consignee", render: (row: any) => row.consigneeName },
    { header: "Contact", render: (row: any) => row.consigneePhone },
    { header: "D.City", render: (row: any) => <>{row.destinationCity}</> },
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
    { header: "Driver", render: (row: any) => row.driverName || "N/D" },
    {
      header: "POD",
      render: (row: any) =>
        row.hasPod ? (
          <button
            className={styles.linkButton}
            onClick={() => setPodTarget({ id: row.id, invoiceNumber: row.invoiceNumber })}
            title="View proof of delivery"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
          >
            <Camera size={15} /> View
          </button>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      header: "Action",
      render: (row: any) => {
        // Dispatched: allow changing the assigned driver or returning to hub
        if (row.status === REASSIGNABLE_STATUS) {
          return (
            <Button
              className={styles.actionBtn}
              onClick={() => handleEditDriver(row.id)}
            >
              Edit Driver
            </Button>
          );
        }
        // Delivered (or anything else non-dispatchable): no action
        if (!DISPATCHABLE_STATUSES.includes(row.status)) {
          return <span className="text-gray-400 text-xs">—</span>;
        }
        const due = Number(row.amountDue || 0);
        if (due > 0) {
          // Payment outstanding: disabled button showing the balance owed
          return (
            <span title="Payment outstanding — cannot dispatch">
              <Button
                className={`${styles.actionBtn} ${styles.dueBtn}`}
                disabled
              >
                {formatDue(due)}
              </Button>
            </span>
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
        <h1 className={styles.title}>
          Deliveries{" "}
          <span className={styles.titleCount}>
            ({filteredData.length} Total)
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
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    padding: "0.625rem 0.875rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
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
                      fontWeight: 600,
                      padding: "0.0625rem 0.4375rem",
                      borderRadius: "9999px",
                      backgroundColor: isActive ? "#dbeafe" : "#f3f4f6",
                      color: isActive ? "#2563eb" : "#6b7280",
                    }}
                  >
                    {tabCounts[tab.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedIds.length > 0 && (
            <Button
              variant="primary"
              onClick={handleBulkDispatch}
              disabled={selectedDispatchable.length === 0}
              className={styles.bulkDispatchBtn}
            >
              Dispatch Selected ({selectedDispatchable.length})
            </Button>
          )}
          <input
            type="text"
            placeholder="Search by invoice #, consignee, consigner, or phone"
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
            {filteredData.length === 1 ? "" : "s"} for &quot;{searchTerm}&quot;
            across all statuses
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

      {/* Dispatch: (Received At Hub | Returned To Hub) -> Out For Delivery */}
      <DispatchDriverModal
        isOpen={dispatchTargetNumbers !== null}
        invoiceIds={dispatchTargetNumbers || []}
        onClose={() => setDispatchTargetNumbers(null)}
        onDispatched={handleDispatched}
      />

      {/* Reassign / Return: acts on an Out For Delivery invoice */}
      <DispatchDriverModal
        isOpen={reassignTargetNumbers !== null}
        invoiceIds={reassignTargetNumbers || []}
        mode="reassign"
        onClose={() => setReassignTargetNumbers(null)}
        onDispatched={handleReassigned}
      />

      {/* View proof-of-delivery photo for a delivered shipment */}
      <PodViewerModal
        isOpen={podTarget !== null}
        shipmentId={podTarget?.id ?? null}
        invoiceNumber={podTarget?.invoiceNumber ?? ""}
        onClose={() => setPodTarget(null)}
      />
    </>
  );
}
