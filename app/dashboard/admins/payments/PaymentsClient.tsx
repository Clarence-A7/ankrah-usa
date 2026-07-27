"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import ChargeInvoiceModal from "@/app/components/ChargeInvoiceModal";
import styles from "./payments.module.css";
import Button from "../../../components/ui/Button";

type Payment = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerCode: string;
  consignerName: string;
  amount: number;
  paymentType: "booking_deposit" | "booking_full" | "balance" | "vehicle";
  stripeSessionId: string;
  hasPdf: boolean;
  createdAt: string;
};

type RecentActivityItem = {
  id: string;
  invoiceNumber: string;
  consignerName: string;
  amount: number;
  paymentType: string;
  createdAt: string;
  hasPdf: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  booking_deposit: "Booking Deposit",
  booking_full: "Booking (Full)",
  balance: "Balance Payment",
  vehicle: "Vehicle Shipment",
};

function formatCurrency(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PaymentsClient({
  payments,
  totalCount,
  totalAmount,
  page,
  pageSize,
  query,
  typeFilter,
}: {
  payments: Payment[];
  totalCount: number;
  totalAmount: number;
  page: number;
  pageSize: number;
  query: string;
  typeFilter: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(query);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>(
    [],
  );
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activePayment, setActivePayment] = useState<
    Payment | RecentActivityItem | null
  >(null);
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [chargeModalInvoiceNumber, setChargeModalInvoiceNumber] = useState<
    string | null
  >(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const fetchRecentActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments/recent", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.status === "success") {
        setRecentActivity(json.data);
      }
    } catch {
      // Silently skip — the feed will retry on the next interval.
    }
  }, []);

  useEffect(() => {
    fetchRecentActivity();
    const interval = setInterval(fetchRecentActivity, 15000);
    return () => clearInterval(interval);
  }, [fetchRecentActivity]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  function updateQueryParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateQueryParams({ q: searchInput || undefined, page: undefined });
  }

  function handleTypeChange(value: string) {
    updateQueryParams({ type: value || undefined, page: undefined });
  }

  function goToPage(target: number) {
    updateQueryParams({ page: target > 1 ? String(target) : undefined });
  }

  async function openPdf(payment: Payment | RecentActivityItem) {
    setActivePayment(payment);
    setPdfModalOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    setPdfUrl(null);

    try {
      const res = await fetch(`/api/admin/payments/${payment.id}/pdf`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Unable to load PDF.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Unable to load PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  function closeModal() {
    setPdfModalOpen(false);
    setActivePayment(null);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setPdfError(null);
  }

  function openChargeModal(invoiceNumber: string) {
    setChargeModalInvoiceNumber(invoiceNumber);
    setChargeModalOpen(true);
  }

  function closeChargeModal() {
    setChargeModalOpen(false);
    setChargeModalInvoiceNumber(null);
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Payments</h1>
          <p className={styles.pageSubtitle}>
            Every payment collected across bookings, balances, and vehicle
            shipments.
          </p>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Total (filtered)</span>
          <span className={styles.summaryValue}>
            {formatCurrency(totalAmount)}
          </span>
          <span className={styles.summaryCount}>{totalCount} payments</span>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <div className={styles.filterBar}>
            <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
              <input
                type="text"
                placeholder="Search invoice #, customer, or code..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={styles.searchInput}
              />
              <button type="submit" className={styles.searchButton}>
                Search
              </button>
            </form>

            <select
              value={typeFilter}
              onChange={(e) => handleTypeChange(e.target.value)}
              className={styles.typeSelect}
            >
              <option value="">All types</option>
              <option value="booking_deposit">Booking Deposit</option>
              <option value="booking_full">Booking (Full)</option>
              <option value="balance">Balance Payment</option>
              <option value="vehicle">Vehicle Shipment</option>
            </select>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className={styles.rightAlign}>Amount</th>
                  <th>Date</th>
                  <th className={styles.rightAlign}>PDF</th>
                  <th className={styles.rightAlign}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>
                      No payments found for this filter.
                    </td>
                  </tr>
                )}
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.invoiceCell}>{p.invoiceNumber}</td>
                    <td>
                      <div className={styles.customerName}>
                        {p.consignerName}
                      </div>
                      <div className={styles.customerCode}>
                        {p.customerCode}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`${styles.typeBadge} ${styles["type_" + p.paymentType]}`}
                      >
                        {TYPE_LABELS[p.paymentType] || p.paymentType}
                      </span>
                    </td>
                    <td className={styles.rightAlign}>
                      {formatCurrency(p.amount)}
                    </td>
                    <td className={styles.dateCell}>
                      {formatDate(p.createdAt)}
                    </td>
                    <td className={styles.rightAlign}>
                      {p.hasPdf ? (
                        <button
                          className={styles.viewPdfButton}
                          onClick={() => openPdf(p)}
                        >
                          View PDF
                        </button>
                      ) : (
                        <span className={styles.noPdf}>—</span>
                      )}
                    </td>
                    <td className={styles.rightAlign}>
                      <Button
                        variant="primary"
                        className={styles.rowChargeButton}
                        onClick={() => openChargeModal(p.invoiceNumber)}
                      >
                        Charge
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className={styles.pageButton}
              >
                Previous
              </button>
              <span className={styles.pageIndicator}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className={styles.pageButton}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <aside className={styles.activityPanel}>
          <div className={styles.activityHeader}>
            <h2 className={styles.activityTitle}>Recent Activity</h2>
            <span className={styles.liveDot} title="Updates automatically" />
          </div>
          <div className={styles.activityList}>
            {recentActivity.length === 0 && (
              <p className={styles.activityEmpty}>No recent payments yet.</p>
            )}
            {recentActivity.map((item) => (
              <div key={item.id} className={styles.activityItem}>
                <div className={styles.activityItemTop}>
                  <span className={styles.activityInvoice}>
                    {item.invoiceNumber}
                  </span>
                  <span className={styles.activityAmount}>
                    {formatCurrency(item.amount)}
                  </span>
                </div>
                <div className={styles.activityItemBottom}>
                  <span className={styles.activityName}>
                    {item.consignerName}
                  </span>
                  <span className={styles.activityTime}>
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
                {item.hasPdf && (
                  <button
                    className={styles.activityPdfLink}
                    onClick={() => openPdf(item)}
                  >
                    View invoice PDF
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {pdfModalOpen && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3>
                Invoice{" "}
                {activePayment && "invoiceNumber" in activePayment
                  ? activePayment.invoiceNumber
                  : ""}
              </h3>
              <button
                className={styles.modalClose}
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              {pdfLoading && <p className={styles.modalStatus}>Loading PDF…</p>}
              {pdfError && <p className={styles.modalError}>{pdfError}</p>}
              {pdfUrl && !pdfLoading && !pdfError && (
                <iframe
                  src={pdfUrl}
                  className={styles.pdfFrame}
                  title="Invoice PDF"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {chargeModalOpen && (
        <ChargeInvoiceModal
          initialInvoiceNumber={chargeModalInvoiceNumber ?? undefined}
          onClose={closeChargeModal}
          onPaymentLinkCreated={fetchRecentActivity}
        />
      )}
    </div>
  );
}
