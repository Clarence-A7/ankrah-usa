"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table } from "./../../../components/ui/Table";
import Button from "./../../../components/ui/Button";
import styles from "./../../styles/dashboard.module.css";
import MarkReceivedConfirmModal from "./../../../components/MarkReceivedConfirmModal";
import PrintInvoiceQRModal from "./../../../components/PrintInvoiceQRModal";
import ImageLightbox from "./../../../components/ImageLightbox";
import SendQuoteModal from "./../../../components/SendQuoteModal";
import VehicleQuoteDetailsModal from "./../../../components/VehicleQuoteDetailsModal";
import {
  getStatusBadge,
  TITLE_STATUS_LABELS,
  formatMoney,
} from "./../../../components/vehicleQuoteHelpers";
import { useAutoRefresh } from "@/app/lib/hooks/useAutoRefresh";
import { ImageOff, PackageCheck, Printer, Pencil } from "lucide-react";

const PIPELINE_ORDER = [
  "Ready For Pickup",
  "Pending Pickup",
  "Collected",
  "Booked",
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

const STATUS_TABS = [
  {
    key: "new",
    label: "New",
    matches: (row: any) => row.status === "new",
  },
  {
    key: "quoted",
    label: "Quoted",
    matches: (row: any) => row.status === "quoted",
  },
  {
    key: "booked",
    label: "Booked",
    matches: (row: any) =>
      row.status === "booked" && row.linkedInvoiceStatus === "Booked",
  },
  {
    key: "received",
    label: "Received",
    matches: (row: any) =>
      row.status === "booked" &&
      row.linkedInvoiceStatus &&
      isAtLeast(row.linkedInvoiceStatus, "Received At Origin"),
  },
  {
    key: "declined",
    label: "Declined",
    matches: (row: any) => row.status === "declined",
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

export default function VehicleQuotesTableClient({
  vehicleQuoteRequests,
}: {
  vehicleQuoteRequests: any[];
}) {
  const router = useRouter();
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [quoteModalTarget, setQuoteModalTarget] = useState<any | null>(null);
  const [receiveTargets, setReceiveTargets] = useState<ReceiveTarget[] | null>(
    null,
  );
  const [qrPrintTargets, setQrPrintTargets] = useState<QRTarget[] | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusKey>(STATUS_TABS[0].key);
  const [searchTerm, setSearchTerm] = useState("");

  // Paused while any modal (including the photo lightbox) is open, so a
  // background refresh never swaps out the row currently being viewed,
  // quoted, received, or labeled mid-action.
  useAutoRefresh(() => router.refresh(), {
    intervalMs: 60_000,
    enabled:
      !selectedRequest &&
      !quoteModalTarget &&
      !receiveTargets &&
      !qrPrintTargets &&
      !lightboxImage,
  });

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const isSearching = normalizedSearch.length > 0;

  const matchesSearch = (row: any) => {
    if (!isSearching) return true;
    const haystack = [
      row.referenceNumber,
      row.requesterName,
      row.requesterPhone,
      row.vin,
      row.vehicleMake,
      row.vehicleModel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedSearch);
  };

  const searchedData = useMemo(
    () => vehicleQuoteRequests.filter(matchesSearch),
    [vehicleQuoteRequests, normalizedSearch],
  );

  const activeTabDef = STATUS_TABS.find((tab) => tab.key === activeTab)!;

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tab of STATUS_TABS) {
      counts[tab.key] = searchedData.filter((row) => tab.matches(row)).length;
    }
    return counts;
  }, [searchedData]);

  const filteredData = useMemo(
    () =>
      isSearching
        ? searchedData
        : searchedData.filter((row) => activeTabDef.matches(row)),
    [searchedData, activeTabDef, isSearching],
  );

  const handleTabChange = (tabKey: StatusKey) => {
    setActiveTab(tabKey);
  };

  const handleQuoteSent = () => {
    setQuoteModalTarget(null);
    router.refresh();
  };

  const handleMarkReceived = (row: any) => {
    if (!row.linkedInvoiceId || !row.bookedInvoiceNumber) return;
    setReceiveTargets([
      { id: row.linkedInvoiceId, invoiceNumber: row.bookedInvoiceNumber },
    ]);
  };

  const handleReceived = () => {
    setReceiveTargets(null);
    router.refresh();
  };

  const handlePrintLabel = (row: any) => {
    if (!row.bookedInvoiceNumber) return;
    setQrPrintTargets([
      {
        invoiceNumber: row.bookedInvoiceNumber,
        items: row.linkedInvoiceItems || [],
      },
    ]);
  };

  const columns = [
    {
      header: "Reference",
      render: (row: any) => (
        <button
          className={styles.linkButton}
          onClick={() => setSelectedRequest(row)}
        >
          {row.referenceNumber}
        </button>
      ),
    },
    {
      header: "Photo",
      render: (row: any) =>
        row.vehicleImageUrl ? (
          <img
            src={row.vehicleImageUrl}
            alt={`${row.vehicleYear} ${row.vehicleMake} ${row.vehicleModel}`}
            onClick={() => setLightboxImage(row.vehicleImageUrl)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              objectFit: "cover",
              cursor: "pointer",
              border: "1px solid #e5e7eb",
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center text-gray-300"
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
            }}
            title="No photo provided"
          >
            <ImageOff size={16} />
          </div>
        ),
    },
    { header: "Requester", render: (row: any) => row.requesterName },
    { header: "Contact", render: (row: any) => row.requesterPhone },
    {
      header: "Vehicle",
      render: (row: any) => (
        <>
          {row.vehicleYear} {row.vehicleMake} {row.vehicleModel}
          <br />
          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            {row.vin}
          </span>
        </>
      ),
    },
    {
      header: "Title",
      render: (row: any) =>
        TITLE_STATUS_LABELS[row.titleStatus] || row.titleStatus,
    },
    {
      header: "Quoted",
      render: (row: any) =>
        row.quotedAmount !== null ? formatMoney(Number(row.quotedAmount)) : "—",
    },
    {
      header: "Status",
      render: (row: any) =>
        row.linkedInvoiceStatus &&
        isAtLeast(row.linkedInvoiceStatus, "Received At Origin")
          ? getStatusBadge(row.linkedInvoiceStatus)
          : getStatusBadge(row.status),
    },
    {
      header: "Action",
      render: (row: any) => {
        if (row.status === "new" || row.status === "contacted") {
          return (
            <Button
              variant="primary"
              className={styles.actionBtn}
              onClick={() => setQuoteModalTarget({ ...row, isEdit: false })}
            >
              Quote
            </Button>
          );
        }
        // Quote already sent -- offer an edit rather than a dead end.
        // Deliberately gated to exactly this status: booked rows have a
        // real paid invoice already, so editing the price there would
        // desync from what was actually charged and belongs to a
        // different flow entirely, not this one.
        if (row.status === "quoted") {
          return (
            <Button
              variant="secondary"
              className={styles.actionBtn}
              onClick={() => setQuoteModalTarget({ ...row, isEdit: true })}
            >
              <Pencil size={14} style={{ marginRight: "0.25rem" }} />
              Edit Quote
            </Button>
          );
        }
        if (row.status === "booked" && row.linkedInvoiceStatus === "Booked") {
          return (
            <Button
              variant="primary"
              className={styles.actionBtn}
              onClick={() => handleMarkReceived(row)}
            >
              <PackageCheck size={14} style={{ marginRight: "0.25rem" }} />
              Mark as Received
            </Button>
          );
        }
        if (
          row.status === "booked" &&
          row.linkedInvoiceStatus &&
          isAtLeast(row.linkedInvoiceStatus, "Received At Origin")
        ) {
          return (
            <Button
              variant="primary"
              className={styles.actionBtn}
              onClick={() => handlePrintLabel(row)}
            >
              <Printer size={14} style={{ marginRight: "0.25rem" }} />
              Label
            </Button>
          );
        }
        return <span style={{ color: "#d1d5db" }}>—</span>;
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
          Vehicle Quote Requests{" "}
          <span className={styles.titleCount}>
            ({filteredData.length}{" "}
            {STATUS_TABS.find((t) => t.key === activeTab)?.label})
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

          <input
            type="text"
            placeholder="Search by reference #, requester, phone, VIN, or vehicle"
            className={styles.searchInput}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {isSearching && (
            <button
              onClick={() => setSearchTerm("")}
              className={styles.clearBtn}
              type="button"
            >
              Clear search
            </button>
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

      {selectedRequest && (
        <VehicleQuoteDetailsModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onImageClick={(src) => setLightboxImage(src)}
        />
      )}

      {quoteModalTarget && (
        <SendQuoteModal
          request={quoteModalTarget}
          onClose={() => setQuoteModalTarget(null)}
          onSent={handleQuoteSent}
        />
      )}

      <MarkReceivedConfirmModal
        isOpen={receiveTargets !== null}
        targets={receiveTargets || []}
        onClose={() => setReceiveTargets(null)}
        onReceived={handleReceived}
      />

      {qrPrintTargets && qrPrintTargets.length > 0 && (
        <PrintInvoiceQRModal
          invoices={qrPrintTargets}
          onClose={() => setQrPrintTargets(null)}
        />
      )}

      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </>
  );
}
