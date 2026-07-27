"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../styles/dashboard.module.css";
import reportStyles from "./reporting.module.css";

interface ReportingData {
  range: { from: string; to: string };
  revenue: { collected: number; billed: number };
  deliveredCount: number;
  containersOpenedCount: number;
  topDestinations: { city: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default function ReportingClient({ data }: { data: ReportingData }) {
  const router = useRouter();
  const [from, setFrom] = useState(data.range.from);
  const [to, setTo] = useState(data.range.to);
  const [reportType, setReportType] = useState("revenue");
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const applyRange = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/dashboard/admins/reporting?from=${from}&to=${to}`);
  };

  const exportPdf = async () => {
    setDownloading(true);
    setExportError(null);
    try {
      const res = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, from, to }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setExportError(j.error || "Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reportType}-report-${from}_to_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const maxDestCount = Math.max(...data.topDestinations.map((d) => d.count), 1);
  const maxStatusCount = Math.max(
    ...data.statusBreakdown.map((s) => s.count),
    1,
  );

  return (
    <div className={styles.dashboardContainer}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Reporting</h1>
        <div className={reportStyles.exportBar}>
          <select
            className={reportStyles.reportSelect}
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            disabled={downloading}
            aria-label="Report type"
          >
            <option value="revenue">Revenue</option>
            <option value="unpaid">Unpaid Invoices</option>
            <option value="customers">Customers</option>
            <option value="vehicle">Vehicle Requests</option>
            <option value="demography">Demography (Destinations)</option>
          </select>
          <button
            type="button"
            className={reportStyles.exportBtn}
            onClick={exportPdf}
            disabled={downloading}
          >
            {downloading ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>
      {exportError && <p className={reportStyles.exportError}>{exportError}</p>}

      <form onSubmit={applyRange} className={reportStyles.rangeForm}>
        <div className={reportStyles.rangeField}>
          <label>From</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={reportStyles.rangeField}>
          <label>To</label>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button type="submit" className={reportStyles.applyBtn}>
          Apply Range
        </button>
      </form>

      <div className={reportStyles.summaryGrid}>
        <div className={reportStyles.summaryCard}>
          <p className={reportStyles.summaryLabel}>Revenue Collected</p>
          <p className={reportStyles.summaryValue}>
            {currency.format(data.revenue.collected)}
          </p>
        </div>
        <div className={reportStyles.summaryCard}>
          <p className={reportStyles.summaryLabel}>Total Billed</p>
          <p className={reportStyles.summaryValue}>
            {currency.format(data.revenue.billed)}
          </p>
        </div>
        <div className={reportStyles.summaryCard}>
          <p className={reportStyles.summaryLabel}>Delivered</p>
          <p className={reportStyles.summaryValue}>{data.deliveredCount}</p>
        </div>
        <div className={reportStyles.summaryCard}>
          <p className={reportStyles.summaryLabel}>Containers Opened</p>
          <p className={reportStyles.summaryValue}>
            {data.containersOpenedCount}
          </p>
        </div>
      </div>

      <div className={reportStyles.tablesGrid}>
        <div className={reportStyles.panel}>
          <h2 className={reportStyles.panelTitle}>Top Destinations</h2>
          {data.topDestinations.length === 0 ? (
            <p className={reportStyles.emptyText}>No invoices in this range.</p>
          ) : (
            <ul className={reportStyles.barList}>
              {data.topDestinations.map((d) => (
                <li key={d.city}>
                  <div className={reportStyles.barRow}>
                    <span>{d.city}</span>
                    <span className={reportStyles.barCount}>{d.count}</span>
                  </div>
                  <div className={reportStyles.barTrack}>
                    <div
                      className={reportStyles.barFill}
                      style={{ width: `${(d.count / maxDestCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={reportStyles.panel}>
          <h2 className={reportStyles.panelTitle}>Status Breakdown</h2>
          {data.statusBreakdown.length === 0 ? (
            <p className={reportStyles.emptyText}>No invoices in this range.</p>
          ) : (
            <ul className={reportStyles.barList}>
              {data.statusBreakdown.map((s) => (
                <li key={s.status}>
                  <div className={reportStyles.barRow}>
                    <span>{s.status}</span>
                    <span className={reportStyles.barCount}>{s.count}</span>
                  </div>
                  <div className={reportStyles.barTrack}>
                    <div
                      className={reportStyles.barFillAccent}
                      style={{ width: `${(s.count / maxStatusCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
