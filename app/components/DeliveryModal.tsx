// app/components/DeliveryConfirmModal.tsx
"use client";

import React, { useState } from "react";
import { X, CheckCircle2, AlertTriangle, Truck } from "lucide-react";
import styles from "../dashboard/styles/my-pickups.module.css";

interface ShipmentItem {
  id: string;
  itemType: string;
  quantity: number;
}

interface DeliveryConfirmModalProps {
  invoiceNumber: string;
  shipmentId: string;
  items: ShipmentItem[];
  onClose: () => void;
  onDelivered: () => void; // called after status successfully updates
}

type FlowState = "confirming" | "updating-status" | "done" | "error";

export default function DeliveryConfirmModal({
  invoiceNumber,
  shipmentId,
  items,
  onClose,
  onDelivered,
}: DeliveryConfirmModalProps) {
  const [flowState, setFlowState] = useState<FlowState>("confirming");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalItemCount = items.length;
  const isBusy = flowState === "updating-status";

  const handleConfirm = async () => {
    setErrorMessage(null);

    try {
      setFlowState("updating-status");

      const response = await fetch(`/api/shipments/${shipmentId}/deliver`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Status update failed");
      }

      setFlowState("done");
      onDelivered();
    } catch (err) {
      console.error("Delivery confirmation failed:", err);
      setFlowState("error");
      setErrorMessage(
        "Something went wrong while confirming the delivery. Please try again.",
      );
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={isBusy ? undefined : onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Confirm delivery"
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Confirm Delivery</span>
          {!isBusy && (
            <button
              type="button"
              className={styles.modalCloseBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <X className={styles.modalCloseIcon} />
            </button>
          )}
        </div>

        <p className={styles.modalSubtitle}>
          Invoice <strong>{invoiceNumber}</strong> — verify the items below
          before marking as delivered.
        </p>

        {/* Manifest items */}
        <ul className={styles.modalItemList}>
          {items.map((item, index) => (
            <li key={item.id} className={styles.modalItem}>
              <span className={styles.modalItemIndex}>
                {index + 1}/{totalItemCount}
              </span>
              <span className={styles.modalItemType}>{item.itemType}</span>
              <span className={styles.modalItemQty}>Qty: {item.quantity}</span>
            </li>
          ))}
        </ul>

        {/* Status banners */}
        {flowState === "error" && errorMessage && (
          <div className={styles.modalErrorBanner}>
            <AlertTriangle className={styles.modalErrorIcon} />
            <span>{errorMessage}</span>
          </div>
        )}

        {flowState === "updating-status" && (
          <div className={styles.modalProgressBanner}>
            <Truck className={styles.modalProgressIcon} />
            <span>Confirming delivery…</span>
          </div>
        )}

        {flowState === "done" && (
          <div className={styles.modalSuccessBanner}>
            <CheckCircle2 className={styles.modalSuccessIcon} />
            <span>Shipment marked as delivered successfully.</span>
          </div>
        )}

        {/* Footer actions */}
        <div className={styles.modalFooter}>
          {flowState !== "done" ? (
            <>
              <button
                type="button"
                className={styles.modalSecondaryBtn}
                onClick={onClose}
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalPrimaryBtn}
                onClick={handleConfirm}
                disabled={isBusy}
              >
                <Truck className={styles.modalPrimaryBtnIcon} />
                {flowState === "error" ? "Retry" : "Confirm Delivery"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.modalPrimaryBtn}
              onClick={onClose}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
