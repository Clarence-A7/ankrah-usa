"use client";

import React from "react";
import { useAuth } from "./providers/AuthProvider";
import styles from "../dashboard/styles/dashboard.module.css";

export interface InvoiceItemData {
  id: string;
  itemType: string;
  quantity?: number;
  price?: number | string;
  invoiceId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceContainerData {
  id: string;
  customerCode?: string;
  invoiceNumber?: string;
  consignerName?: string;
  consignerPhone?: string;
  customerNumber?: string;
  consignerEmail?: string;
  pickupStreet?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZip?: string;
  consigneeName?: string;
  consigneePhone?: string;
  destinationCity?: string;
  shipmentMode?: string;
  containerId?: string;
  driver?: string;
  loadStatus?: number;
  totalItems?: number;
  amountPaid?: string | number;
  amountDue?: string | number;
  status?: string;
  pickupDriver?: string;
  pickupDriverName?: string;
  createdAt?: string;
  items?: InvoiceItemData[];
}

// Self-contained status → badge colors (no global theme dependency), grouped by
// pipeline phase. Falls back to a neutral grey for anything unmapped.
function statusBadgeStyle(status?: string): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "2px 10px",
    fontSize: "0.7rem",
    fontWeight: 600,
    borderRadius: "9999px",
    border: "1px solid",
    whiteSpace: "nowrap",
  };
  const palette: Record<string, { bg: string; fg: string; bd: string }> = {
    "Ready For Pickup": { bg: "#eff6ff", fg: "#1d4ed8", bd: "#bfdbfe" },
    "Pending Pickup": { bg: "#fff7ed", fg: "#c2410c", bd: "#fed7aa" },
    Collected: { bg: "#ecfeff", fg: "#0e7490", bd: "#a5f3fc" },
    "Received At Origin": { bg: "#eef2ff", fg: "#4338ca", bd: "#c7d2fe" },
    "In-Transit": { bg: "#f5f3ff", fg: "#6d28d9", bd: "#ddd6fe" },
    Arrived: { bg: "#f5f3ff", fg: "#6d28d9", bd: "#ddd6fe" },
    Cleared: { bg: "#f0f9ff", fg: "#0369a1", bd: "#bae6fd" },
    "Received At Hub": { bg: "#ecfeff", fg: "#0e7490", bd: "#a5f3fc" },
    "Out For Delivery": { bg: "#eff6ff", fg: "#1d4ed8", bd: "#bfdbfe" },
    "Returned To Hub": { bg: "#fef2f2", fg: "#b91c1c", bd: "#fecaca" },
    Delivered: { bg: "#f0fdf4", fg: "#15803d", bd: "#bbf7d0" },
  };
  const c = palette[status ?? ""] ?? { bg: "#f3f4f6", fg: "#374151", bd: "#e5e7eb" };
  return { ...base, backgroundColor: c.bg, color: c.fg, borderColor: c.bd };
}

interface ContainerDetailsModalProps {
  isOpen: boolean;
  container: InvoiceContainerData | null;
  onClose: () => void;
}

export const InvoiceDetailsModal: React.FC<ContainerDetailsModalProps> = ({
  isOpen,
  container,
  onClose,
}) => {
  const { user, isLoading } = useAuth();

  if (!isOpen || !container || isLoading || !user) return null;

  // Function-based visibility: destination admins never see money (matches the
  // app-wide rule in getContainersForDashboard). super_admin + origin_admin do.
  const canSeeFinancials =
    user.role === "super_admin" || user.role === "origin_admin";

  const renderPaymentBadge = () => {
    const due = Number(container.amountDue || 0);
    const paid = Number(container.amountPaid || 0);

    if (due === 0) {
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
    if (due > 0 && paid > 0) {
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

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className="flex items-center gap-3 flex-wrap">
            <h3>INVOICE NUMBER: {container.invoiceNumber || container.id}</h3>
            {container.status && (
              <span style={statusBadgeStyle(container.status)}>
                {container.status}
              </span>
            )}
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* CONSIGNER DETAILS */}
          <div className={styles.consignerDetails}>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>CONSIGNER NAME</span>
                <span className={styles.detailValue}>
                  {container.consignerName || "—"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>CONSIGNER ADDRESS</span>
                <span className={styles.detailValue}>
                  {container.pickupStreet || "—"}, {container.pickupCity || "—"}
                  , {container.pickupState || "—"}, {container.pickupZip || "—"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>CUSTOMER NUMBER</span>
                <span className={styles.detailValue}>
                  {container.customerCode || "—"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>PHONE</span>
                <span className={styles.detailValue}>
                  {container.consignerPhone || "—"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>EMAIL</span>
                <span className={styles.detailValue}>
                  {container.consignerEmail || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* LOAD DETAILS GRID */}
          <div className={styles.loadDetails}>
            <div>
              {/* Replaced standard Tailwind text classes with your module style class */}
              <span className={`${styles.detailLabel} block mb-2`}>
                Item List ({container.items?.length || 0})
              </span>
              <br />

              {container.items && container.items.length > 0 ? (
                <ul className="divide-y divide-gray-200 max-h-40 overflow-y-auto pr-1">
                  {container.items.map((item, idx) => (
                    <li
                      key={item.id || idx}
                      className="py-2 flex justify-between border-b border-gray-100 last:border-0"
                    >
                      <span
                        className={`${styles.detailValue} text-sm text-gray-700`}
                      >
                        {item.quantity ? `${item.quantity}x ` : ""}
                        {item.itemType || "Unlabeled Item"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-gray-400 italic">
                  No sub-items cataloged on this invoice number.
                </span>
              )}
            </div>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>SHIPMENT MODE</span>
                <span className={styles.detailValue}>
                  {container.shipmentMode || "—"}
                </span>
              </div>

              {canSeeFinancials && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>PAYMENT STATUS:</span>
                  <div className="mt-1 flex items-center">
                    {renderPaymentBadge()}
                  </div>
                </div>
              )}

              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>CONTAINER NO:</span>
                <span className={styles.detailValue}>
                  {container.containerId || "—"}
                </span>
              </div>
            </div>{" "}
          </div>

          {/* CONSIGNEE DETAILS */}
          <div className={styles.consigneeDetails}>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>CONSIGNEE NAME</span>
                <span className={styles.detailValue}>
                  {container.consigneeName || "—"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>DESTINATION CITY</span>
                <span className={styles.detailValue}>
                  {container.destinationCity || "—"}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>CONSIGNEE PHONE</span>
                <span className={styles.detailValue}>
                  {container.consigneePhone || "—"}
                </span>
              </div>
            </div>
          </div>

          {/* BOTTOM RUNNER INFO SECTION */}
          <div className={styles.bottomSection}>
            <span className={styles.detailLabel}>
              PICKED UP BY:{" "}
              {container.pickupDriverName ||
                container.pickupDriver ||
                "Unassigned"}
            </span>
            <span className={styles.detailLabel}>
              DATE: {container.createdAt || "Unassigned"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
