"use client";

import React from "react";
import styles from "../../styles/dashboard.module.css";

interface DriverMetrics {
  activePickups: number;
  inWarehouse: number;
  enRouteGhana: number;
  createdToday: number;
  createdThisWeek: number;
  createdThisMonth: number;
  totalOrders: number;
  totalInvoicedLedger: number;
}

interface DriverDashboardClientProps {
  metrics: DriverMetrics;
}

export default function DriverDashboardClient({
  metrics,
}: DriverDashboardClientProps) {
  return (
    <div className={styles.dashboardMainContent}>
      {/* KPI Highlight Summary Row Grid */}
      <section className={styles.statsSummaryGrid}>
        <div className={styles.statCard}>
          <div className={styles.cardInnerHeader}>
            <span className={styles.cardSubtitleLabel}>Active Pickups</span>
            <span
              className={`${styles.badgeIndicatorCounter} ${styles.countBlue}`}
            >
              {metrics.activePickups}
            </span>
          </div>
          <h2 className={styles.metricTotalValue}>{metrics.activePickups}</h2>
          <p className={styles.metricFooterContext}>Quick Status</p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.cardInnerHeader}>
            <span className={styles.cardSubtitleLabel}>
              In Warehouse / Ready to Consolidate
            </span>
            <span
              className={`${styles.badgeIndicatorCounter} ${styles.countGray}`}
            >
              📦
            </span>
          </div>
          <h2 className={styles.metricTotalValue}>{metrics.inWarehouse}</h2>
          <p className={styles.metricFooterContext}>Volume or Packages</p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.cardInnerHeader}>
            <span className={styles.cardSubtitleLabel}>En Route to Ghana</span>
            <span
              className={`${styles.badgeIndicatorCounter} ${styles.countPlane}`}
            >
              ✈️
            </span>
          </div>
          <h2 className={styles.metricTotalValue}>{metrics.enRouteGhana}</h2>
          <p className={styles.metricFooterContext}>
            Ocean/Air Tracker Shortcut
          </p>
        </div>
      </section>

      {/* Historical Ledger Separator Header */}
      <div
        className={styles.dashboardActionHeadingRow}
        style={{ marginTop: "32px" }}
      >
        <h2 className={styles.viewSectionTitle}>Pipeline History & Invoices</h2>
      </div>

      {/* Secondary Meta Aggregations Segment Grid Matrix */}
      <section
        className={`${styles.statsSummaryGrid} ${styles.secondaryMetricsGrid}`}
      >
        <div className={`${styles.statCard} ${styles.minimalCard}`}>
          <h3>{metrics.createdToday}</h3>
          <p>Created Today</p>
        </div>
        <div className={`${styles.statCard} ${styles.minimalCard}`}>
          <h3>{metrics.createdThisWeek}</h3>
          <p>This Week</p>
        </div>
        <div className={`${styles.statCard} ${styles.minimalCard}`}>
          <h3>{metrics.createdThisMonth}</h3>
          <p>This Month</p>
        </div>
        <div className={`${styles.statCard} ${styles.minimalCard}`}>
          <h3>{metrics.totalOrders}</h3>
          <p>Total Orders Count</p>
        </div>
        <div
          className={`${styles.statCard} ${styles.minimalCard} ${styles.highlightInvoiceCard}`}
        >
          <h3>
            $
            {metrics.totalInvoicedLedger.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </h3>
          <p>Total Invoiced Ledger</p>
        </div>
      </section>
    </div>
  );
}
