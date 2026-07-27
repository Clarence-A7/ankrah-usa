"use client";

import React from "react";
import { useAuth } from "./providers/AuthProvider"; // Direct session hook integration
import type { ContainerData } from "@/app/lib/dashboard/container-types";
import styles from "../dashboard/styles/dashboard.module.css";

interface ContainerDetailsModalProps {
  isOpen: boolean;
  container: ContainerData | null;
  onClose: () => void;
}

export const ContainerDetailsModal: React.FC<ContainerDetailsModalProps> = ({
  isOpen,
  container,
  onClose,
}) => {
  // 1. Grab the current user context. Keep rendering safe while context initializes
  const { user, isLoading } = useAuth();

  if (!isOpen || !container || isLoading || !user) return null;

  // 2. Refined visibility rules based on platform segmentation roles
  const isSuperAdmin = user.role === "super_admin";
  const isOriginAdmin = user.role === "origin_admin";

  // Destination administrators see container metrics but skip sensitive commercial context
  const canSeeFinancials = isSuperAdmin || isOriginAdmin;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3>Container Details: {container.id}</h3>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Base Logistics Details Grid */}
          <div className={styles.container}>
            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Origin</span>
                <span className={styles.detailValue}>
                  {container.originCity}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Destination</span>
                <span className={styles.detailValue}>
                  {container.destinationCity}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Size</span>
                <span className={styles.detailValue}>{container.size} ft</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Departure Date</span>
                <span className={styles.detailValue}>
                  {container.depatureDate}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Shipping Line</span>
                <span className={styles.detailValue}>
                  {container.shippingLine}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>ETA</span>
                <span className={styles.detailValue}>{container.eta}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Vessel</span>
                <span className={styles.detailValue}>{container.vessel}</span>
              </div>
              {canSeeFinancials && (
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Seal Number</span>
                  <span className={styles.detailValue}>
                    {container.sealNumber}
                  </span>
                </div>
              )}

              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Status</span>
                <span className={styles.detailValue}>{container.status}</span>
              </div>
            </div>
          </div>

          {/* Conditional Segmented Financial Grid */}
          {canSeeFinancials && (
            <div className={styles.containerFinancials}>
              <div className={styles.detailsGridFinancials}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Total Invoices</span>
                  <span className={styles.detailValue}>
                    {container.totalInvoices}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Total Items</span>
                  <span className={styles.detailValue}>
                    {container.totalItems} packages
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>TRR</span>
                  <span className={styles.detailValue}>
                    {container.collectedRevenue}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>TER</span>
                  <span className={styles.detailValue}>
                    {container.revenue}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Core Operations Manifest Footer Block */}
          <div className={styles.bottomSection}>
            <span className={styles.detailLabel}>
              Loaded By: {container.loadedBy || "Unassigned Operations Node"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
