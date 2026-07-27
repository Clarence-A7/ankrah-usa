// app/dashboard/admins/manifests/[id]/page.tsx
"use client";

import React, { use, useState, useEffect, useCallback } from "react";
import { Table } from "../../../../components/ui/Table";
import { Badge, type BadgeVariant } from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import { useAuth } from "../../../../components/providers/AuthProvider";
import { BeginUnstuffingModal } from "../../../../components/BeginUnstuffingModal";
import { PrintLetterhead } from "../../../../components/PrintLetterhead";
import styles from "../../../styles/dashboard.module.css";

interface ManifestItem {
  id: string;
  itemType: string;
  quantity: number;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  consignerName: string;
  destinationCity: string;
  consigneeName: string;
  consigneePhone: string;
  amountDue: number | string; // Prisma Decimal serializes as string over JSON
  amountCollected: number | string;
  status: string;
  loadStatus: string;
  items: ManifestItem[];
}

// Column descriptor for the manifest tables. `hideForRoles`/`printHide` are
// optional per-column flags consumed by the visible/print filters below.
interface ManifestColumn {
  header: React.ReactNode;
  render: (item: InvoiceData) => React.ReactNode;
  printHide?: boolean;
  hideForRoles?: string[];
}

// Normalize status strings so "In-Transit", "IN_TRANSIT", "in transit" all compare equal
const norm = (s: string | undefined | null): string =>
  (s || "").toUpperCase().replace(/[\s-]/g, "_");

// Invoice statuses that mean "this item has been scanned out of the container"
const POST_UNSTUFF = [
  "RECEIVED_AT_HUB",
  "RETURNED_TO_HUB",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export default function ManifestDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const containerId = resolvedParams.id;

  // NOTE: client-side role checks are UX only. Every API route this page
  // calls re-verifies session + role server-side.
  const { user } = useAuth();
  const userRole = user?.role || "";
  const isDestAdmin = userRole === "destination_admin";

  const [invoiceData, setInvoiceData] = useState<InvoiceData[]>([]);
  const [containerStatus, setContainerStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isUnstuffModalOpen, setIsUnstuffModalOpen] = useState<boolean>(false);

  const fetchManifestMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/containers/invoices?containerId=${encodeURIComponent(containerId)}`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to load cross-dock data profiles (Status: ${response.status})`,
        );
      }

      const data = await response.json();
      setInvoiceData(data.invoices || []);
      // Requires the invoices API to also return the container's own status:
      //   { container: { status: "Arrived" }, invoices: [...] }
      // (Never include sealNumber in that payload — seal stays server-side.)
      setContainerStatus(data.container?.status || "");
    } catch (err: any) {
      console.error("❌ Manifest view load failure:", err);
      setError(err.message || "An unexpected network error occurred.");
    } finally {
      setLoading(false);
    }
  }, [containerId]);

  useEffect(() => {
    if (containerId) {
      fetchManifestMetrics();
    }
  }, [containerId, fetchManifestMetrics]);

  // Prisma Decimal fields serialize as strings over JSON — always coerce before comparing
  const toNumber = (val: number | string): number => Number(val) || 0;

  // ---------- Container lifecycle derivations ----------
  // Kept: these drive the container-level triggers (seal verification,
  // starting the scan session) which are a different concern from invoice
  // dispatch — there's no other page these live on. Everything invoice-
  // dispatch-related (checkboxes, per-row Dispatch button, batch dispatch)
  // has moved to the Deliveries page; this page is read-only for invoices.
  const cStatus = norm(containerStatus);
  const totalInvoices = invoiceData.length;
  const receivedCount = invoiceData.filter((inv) =>
    POST_UNSTUFF.includes(norm(inv.status)),
  ).length;

  const isArrived = cStatus === "ARRIVED";
  const readyToUnstuff =
    cStatus === "CLEARED" && totalInvoices > 0 && receivedCount === 0;
  const isUnstuffing =
    cStatus === "CLEARED" &&
    totalInvoices > 0 &&
    receivedCount > 0 &&
    receivedCount < totalInvoices;
  const unstuffingDone =
    totalInvoices > 0 &&
    receivedCount === totalInvoices &&
    ["CLEARED", "RECEIVED_AT_HUB"].includes(cStatus);

  const goToUnstuffPage = () => {
    window.location.href = `/dashboard/admins/manifests/${encodeURIComponent(containerId)}/unstuff`;
  };

  const handlePrint = () => {
    window.print();
  };

  const baseColumns: ManifestColumn[] = [
    {
      header: "Invoice",
      render: (item: InvoiceData) => <strong>{item.invoiceNumber}</strong>,
    },
    {
      header: "Consignee",
      render: (item: InvoiceData) => item.consigneeName,
    },
    {
      header: "D.City",
      render: (item: InvoiceData) => item.destinationCity,
    },

    {
      header: "Contact",
      render: (item: InvoiceData) => item.consigneePhone,
    },
    {
      header: "QTY",
      render: (item: InvoiceData) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {item.items.map((line, idx) => (
            <div
              key={idx}
              style={{
                height: "20px",
                display: "flex",
                alignItems: "center",
                fontWeight: 500,
                color: "#202124",
              }}
            >
              {line.quantity}
            </div>
          ))}
        </div>
      ),
    },
    {
      header: "Items",
      render: (item: InvoiceData) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: "160px",
          }}
        >
          {item.items.map((line, idx) => (
            <div
              key={idx}
              style={{
                height: "20px",
                display: "flex",
                alignItems: "center",
                color: "#3c4043",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={line.itemType}
            >
              {line.itemType}
            </div>
          ))}
        </div>
      ),
    },
    {
      header: "Amount Due",
      render: (item: InvoiceData) => {
        const due = toNumber(item.amountDue);
        return (
          <span
            style={{
              color: due > 0 ? "#d93025" : "inherit",
              fontWeight: due > 0 ? 600 : "normal",
            }}
          >
            {due > 0 ? `$${due.toLocaleString()}` : "$0.00"}
          </span>
        );
      },
    },
    {
      header: "Status",
      printHide: true,
      render: (item: InvoiceData) => {
        const variantMap: Record<string, BadgeVariant> = {
          BOOKED: "transit",
          COLLECTED: "transit",
          CONTAINERIZED: "transit",
          IN_TRANSIT: "transit",
          OUT_FOR_DELIVERY: "transit",
          ARRIVED: "arrived",
          CLEARED: "cleared",
          RECEIVED_AT_HUB: "cleared",
          RETURNED_TO_HUB: "cleared",
          DELIVERED: "completed",
        };

        return (
          <Badge variant={variantMap[norm(item.status)] || "transit"}>
            {item.status}
          </Badge>
        );
      },
    },
  ];

  const visibleColumns = baseColumns.filter(
    (col) => !col.hideForRoles || !col.hideForRoles.includes(userRole),
  );
  const printColumns = visibleColumns.filter((col) => !col.printHide);

  // ---------- Status-driven header action slot ----------
  // Container-lifecycle actions only now — dispatch lives on Deliveries.
  //   Arrived            → "Open Container" (verify seal + clearance date)
  //   Cleared, 0 scanned → "Begin Unstuffing" (opens the scan page)
  //   Cleared, partial   → "Continue Unstuffing (x/y)"
  //   All received       → informational only, no action here
  const renderHeaderAction = () => {
    if (!isDestAdmin) return null;

    if (isArrived) {
      return (
        <Button
          className="no-print"
          onClick={() => setIsUnstuffModalOpen(true)}
        >
          Open Container
        </Button>
      );
    }

    if (readyToUnstuff) {
      return (
        <Button className="no-print" onClick={goToUnstuffPage}>
          Begin Unstuffing
        </Button>
      );
    }

    if (isUnstuffing) {
      return (
        <Button className="no-print" onClick={goToUnstuffPage}>
          Continue Unstuffing ({receivedCount}/{totalInvoices})
        </Button>
      );
    }

    return null;
  };

  const containerBadgeVariant: Record<string, BadgeVariant> = {
    IN_TRANSIT: "transit",
    ARRIVED: "arrived",
    CLEARED: "cleared",
    UNSTUFFED: "completed",
    RECEIVED_AT_HUB: "completed",
  };

  if (loading) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", color: "#5f6368" }}>
        <div className={styles.spinner} style={{ marginBottom: "1rem" }}>
          ⏳
        </div>
        <p>
          Synchronizing packing list records with regional cross-dock ledgers...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "3rem", textAlign: "center", color: "#d93025" }}>
        <h3>⚠️ Live Reconcile Sync Error</h3>
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>
          Retry Handshake Connection
        </Button>
      </div>
    );
  }

  return (
    <PrintLetterhead
      documentLabel={`Packing List · ${containerId}`}
      referenceLine={`Printed ${new Date().toLocaleString()}`}
      screenHeader={
        <div
          style={{
            marginBottom: "1.5rem",
            borderBottom: "1px solid #e8eaed",
            paddingBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <h1
              style={{
                fontSize: "1.75rem",
                color: "#202124",
                margin: 0,
              }}
            >
              Distribution List: {containerId}
            </h1>
            {containerStatus && (
              <Badge variant={containerBadgeVariant[cStatus] || "transit"}>
                {containerStatus}
              </Badge>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            {renderHeaderAction()}
            <Button variant="secondary" onClick={handlePrint}>
              Print / Export PDF
            </Button>
          </div>
        </div>
      }
    >
      {unstuffingDone && (
        <div
          className="no-print"
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            background: "#e6f4ea",
            color: "#137333",
            borderRadius: "6px",
            fontSize: "0.9rem",
          }}
        >
          ✓ All items received. Assign drivers from the Deliveries page.
        </div>
      )}

      {invoiceData.length > 0 ? (
        <>
          <div className="no-print">
            <Table columns={visibleColumns} data={invoiceData} />
          </div>
          <div className="print-only">
            <Table columns={printColumns} data={invoiceData} />
          </div>
        </>
      ) : (
        <div
          style={{
            padding: "3rem",
            textAlign: "center",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            color: "#5f6368",
          }}
        >
          No invoices reconciled or linked to container reference key{" "}
          <strong>{containerId}</strong>.
        </div>
      )}

      <BeginUnstuffingModal
        isOpen={isUnstuffModalOpen}
        containerId={containerId}
        onClose={() => setIsUnstuffModalOpen(false)}
        onCleared={() => {
          setIsUnstuffModalOpen(false);
          fetchManifestMetrics(); // pull the cascaded statuses back down
        }}
      />
    </PrintLetterhead>
  );
}
