// app/components/CollectConfirmModal.tsx
"use client";

import React, { useState } from "react";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import styles from "../dashboard/styles/my-pickups.module.css";

interface ShipmentItem {
  id: string;
  itemType: string;
  quantity: number;
}

interface CollectConfirmModalProps {
  invoiceNumber: string;
  shipmentId: string;
  items: ShipmentItem[];
  onClose: () => void;
  onCollected: () => void; // called after status successfully updates, so parent can refresh/refetch
}

type FlowState = "confirming" | "updating-status" | "done" | "error";

export default function CollectConfirmModal({
  invoiceNumber,
  shipmentId,
  items,
  onClose,
  onCollected,
}: CollectConfirmModalProps) {
  const [flowState, setFlowState] = useState<FlowState>("confirming");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalItemCount = items.length;

  const handleConfirm = async () => {
    setErrorMessage(null);
    setFlowState("updating-status");

    try {
      // shipmentId is server-validated route param; the route handler is
      // responsible for confirming the caller's session/role owns or is
      // authorized to act on this shipment before mutating status.
      const response = await fetch(`/api/shipments/${shipmentId}/collect`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Status update failed");
      }

      setFlowState("done");
      onCollected();
    } catch (err) {
      console.error("Collect flow failed:", err);
      setFlowState("error");
      setErrorMessage(
        "Something went wrong updating the shipment status. Please try again.",
      );
    }
  };

  const isBusy = flowState === "updating-status";

  return (
    <div className={styles.modalOverlay} onClick={isBusy ? undefined : onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Confirm collection"
      >
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Confirm Collection</span>
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
          Invoice <strong>{invoiceNumber}</strong> — confirm the items below
          before marking this shipment as collected.
        </p>

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

        {flowState === "error" && errorMessage && (
          <div className={styles.modalErrorBanner}>
            <AlertTriangle className={styles.modalErrorIcon} />
            <span>{errorMessage}</span>
          </div>
        )}

        {flowState === "updating-status" && (
          <div className={styles.modalProgressBanner}>
            <CheckCircle2 className={styles.modalProgressIcon} />
            <span>Updating shipment status…</span>
          </div>
        )}

        {flowState === "done" && (
          <div className={styles.modalSuccessBanner}>
            <CheckCircle2 className={styles.modalSuccessIcon} />
            <span>Shipment marked as collected.</span>
          </div>
        )}

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
                <CheckCircle2 className={styles.modalPrimaryBtnIcon} />
                {flowState === "error" ? "Retry" : "Confirm Collection"}
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
