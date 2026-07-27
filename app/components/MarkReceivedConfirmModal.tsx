"use client";

import React, { useState } from "react";
import { X, CheckCircle2, AlertTriangle, PackageCheck } from "lucide-react";

interface ReceiveTarget {
  id: string;
  invoiceNumber: string;
}

interface MarkReceivedConfirmModalProps {
  isOpen: boolean;
  targets: ReceiveTarget[];
  onClose: () => void;
  onReceived: () => void; // called after a successful update so parent can refresh/refetch
}

type FlowState = "confirming" | "updating" | "done" | "error";

export default function MarkReceivedConfirmModal({
  isOpen,
  targets,
  onClose,
  onReceived,
}: MarkReceivedConfirmModalProps) {
  const [flowState, setFlowState] = useState<FlowState>("confirming");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isBulk = targets.length > 1;

  const handleConfirm = async () => {
    setErrorMessage(null);
    setFlowState("updating");

    try {
      // Single bulk-capable endpoint; the server verifies role + current
      // status for every id inside one transaction, so a partial update
      // can't happen if some invoices aren't actually COLLECTED anymore.
      const response = await fetch("/api/shipments/mark-received", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targets.map((t) => t.id) }),
      });

      if (!response.ok) {
        let serverMessage = "Failed to update shipment status.";
        try {
          const body = await response.json();
          if (body?.error) serverMessage = body.error;
        } catch {
          // non-JSON error response, keep fallback
        }
        throw new Error(serverMessage);
      }

      setFlowState("done");
      onReceived();
    } catch (err) {
      console.error("Mark as received failed:", err);
      setFlowState("error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Something went wrong updating the shipment status. Please try again.",
      );
    }
  };

  const isBusy = flowState === "updating";

  const handleOverlayClick = () => {
    if (!isBusy) onClose();
  };

  return (
    <div className="mrModalOverlay" onClick={handleOverlayClick}>
      <div
        className="mrModalCard"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Confirm mark as received"
      >
        <div className="mrModalHeader">
          <span className="mrModalTitle">
            Mark as Received {isBulk ? `(${targets.length} Invoices)` : ""}
          </span>
          {!isBusy && flowState !== "done" && (
            <button
              type="button"
              className="mrModalCloseBtn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <p className="mrModalSubtitle">
          {isBulk
            ? "Confirm the invoices below have physically arrived at the origin warehouse."
            : "Confirm this invoice has physically arrived at the origin warehouse."}
        </p>

        <ul className="mrModalList">
          {targets.map((t) => (
            <li key={t.id} className="mrModalListItem">
              {t.invoiceNumber}
            </li>
          ))}
        </ul>

        {flowState === "error" && errorMessage && (
          <div className="mrModalErrorBanner">
            <AlertTriangle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {flowState === "updating" && (
          <div className="mrModalProgressBanner">
            <PackageCheck size={16} />
            <span>Updating status…</span>
          </div>
        )}

        {flowState === "done" && (
          <div className="mrModalSuccessBanner">
            <CheckCircle2 size={16} />
            <span>
              {isBulk
                ? "Selected invoices marked as received."
                : "Invoice marked as received."}
            </span>
          </div>
        )}

        <div className="mrModalFooter">
          {flowState !== "done" ? (
            <>
              <button
                type="button"
                className="mrModalSecondaryBtn"
                onClick={onClose}
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mrModalPrimaryBtn"
                onClick={handleConfirm}
                disabled={isBusy}
              >
                <PackageCheck size={16} />
                {flowState === "error" ? "Retry" : "Confirm"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="mrModalPrimaryBtn"
              onClick={onClose}
            >
              Done
            </button>
          )}
        </div>
      </div>

      <style jsx global>{`
        .mrModalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .mrModalCard {
          background: #fff;
          border-radius: 12px;
          padding: 1.5rem;
          max-width: 420px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
        }
        .mrModalHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .mrModalTitle {
          font-size: 1.0625rem;
          font-weight: 600;
          color: #111827;
        }
        .mrModalCloseBtn {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
        }
        .mrModalSubtitle {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0 0 0.75rem;
        }
        .mrModalList {
          list-style: none;
          margin: 0 0 0.75rem;
          padding: 0;
          max-height: 180px;
          overflow-y: auto;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .mrModalListItem {
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
          border-bottom: 1px solid #f3f4f6;
        }
        .mrModalListItem:last-child {
          border-bottom: none;
        }
        .mrModalErrorBanner,
        .mrModalProgressBanner,
        .mrModalSuccessBanner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 0.75rem;
          border-radius: 8px;
          font-size: 0.8125rem;
          margin-bottom: 0.75rem;
        }
        .mrModalErrorBanner {
          background: #fef2f2;
          color: #b91c1c;
        }
        .mrModalProgressBanner {
          background: #eff6ff;
          color: #1d4ed8;
        }
        .mrModalSuccessBanner {
          background: #f0fdf4;
          color: #15803d;
        }
        .mrModalFooter {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }
        .mrModalSecondaryBtn {
          padding: 0.5rem 0.875rem;
          background: #f3f4f6;
          color: #374151;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .mrModalPrimaryBtn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.875rem;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .mrModalSecondaryBtn:disabled,
        .mrModalPrimaryBtn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
