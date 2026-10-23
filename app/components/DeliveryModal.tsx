// app/components/DeliveryModal.tsx
"use client";

import React, { useState } from "react";
import { X, CheckCircle2, AlertTriangle, Truck, Camera, RotateCcw } from "lucide-react";
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

// Resize + re-encode the photo in the browser so the upload stays small
// (phone photos are multi-MB). Max 1280px on the long edge, JPEG quality 0.7.
async function compressImage(file: File, maxDim = 1280, quality = 0.7): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl; // fall back to the original if canvas is unavailable
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export default function DeliveryConfirmModal({
  invoiceNumber,
  shipmentId,
  items,
  onClose,
  onDelivered,
}: DeliveryConfirmModalProps) {
  const [flowState, setFlowState] = useState<FlowState>("confirming");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);

  const totalItemCount = items.length;
  const isBusy = flowState === "updating-status";

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setErrorMessage(null);
    setPreparingPhoto(true);
    try {
      const compressed = await compressImage(file);
      setPhoto(compressed);
      if (flowState === "error") setFlowState("confirming");
    } catch {
      setErrorMessage("Couldn't process that photo. Please try again.");
    } finally {
      setPreparingPhoto(false);
    }
  };

  const handleConfirm = async () => {
    if (!photo) {
      setErrorMessage("Please take a photo of the delivered package first.");
      setFlowState("error");
      return;
    }
    setErrorMessage(null);

    try {
      setFlowState("updating-status");

      const response = await fetch(`/api/shipments/${shipmentId}/deliver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Status update failed");
      }

      setFlowState("done");
      onDelivered();
    } catch (err) {
      console.error("Delivery confirmation failed:", err);
      setFlowState("error");
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong while confirming the delivery. Please try again.",
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
          Invoice <strong>{invoiceNumber}</strong> — verify the items, then take a
          photo of the delivered package to complete delivery.
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

        {/* Proof-of-delivery photo (required) */}
        {flowState !== "done" && (
          <div style={{ margin: "0.75rem 0 0.25rem" }}>
            <span
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#475569",
                marginBottom: "0.5rem",
              }}
            >
              Proof of delivery photo <span style={{ color: "#dc2626" }}>*</span>
            </span>

            {photo ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt="Delivered package"
                  style={{
                    width: "100%",
                    maxHeight: 220,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    alignSelf: "flex-start",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "#2563eb",
                    cursor: isBusy ? "not-allowed" : "pointer",
                  }}
                >
                  <RotateCcw size={15} />
                  Retake photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoChange}
                    disabled={isBusy}
                    style={{ display: "none" }}
                  />
                </label>
              </div>
            ) : (
              <label
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  padding: "1.5rem 1rem",
                  border: "1.5px dashed #cbd5e1",
                  borderRadius: 10,
                  background: "#f8fafc",
                  color: "#475569",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: preparingPhoto ? "wait" : "pointer",
                }}
              >
                <Camera size={22} />
                {preparingPhoto ? "Preparing photo…" : "Tap to take / upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  disabled={preparingPhoto}
                  style={{ display: "none" }}
                />
              </label>
            )}
          </div>
        )}

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
                disabled={isBusy || preparingPhoto || !photo}
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
