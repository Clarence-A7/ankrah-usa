"use client";

import React, { useEffect, useState } from "react";
import { getAvailableDrivers, type DriverOption } from "../actions/dispatch";

interface DispatchDriverModalProps {
  isOpen: boolean;
  invoiceIds: string[]; // invoice numbers
  mode?: "dispatch" | "reassign";
  onClose: () => void;
  onDispatched: (staffId: string) => void;
}

export function DispatchDriverModal({
  isOpen,
  invoiceIds,
  mode = "dispatch",
  onClose,
  onDispatched,
}: DispatchDriverModalProps) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReassign = mode === "reassign";
  const busy = isSubmitting || isReturning;

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSelectedDriverId("");
    setIsLoadingDrivers(true);

    getAvailableDrivers()
      .then((result) => setDrivers(result))
      .catch(() => setError("Could not load drivers. Please try again."))
      .finally(() => setIsLoadingDrivers(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!selectedDriverId) {
      setError("Please select a driver.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const endpoint = isReassign
        ? "/api/shipments/reassign"
        : "/api/shipments/dispatch";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumbers: invoiceIds,
          staffId: selectedDriverId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit.");
      }

      onDispatched(selectedDriverId);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to submit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Return the shipment(s) to the hub: status -> "Returned To Hub"
  const handleReturnToHub = async () => {
    setIsReturning(true);
    setError(null);

    try {
      const response = await fetch("/api/shipments/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumbers: invoiceIds }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to return to hub.");
      }

      onDispatched("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to return to hub.");
    } finally {
      setIsReturning(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "400px",
          maxWidth: "90vw",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "1.1rem",
            fontWeight: 600,
            marginBottom: "0.25rem",
          }}
        >
          {isReassign ? "Change Delivery Driver" : "Assign Delivery Driver"}
        </h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "#6b7280",
            marginBottom: "1rem",
          }}
        >
          {invoiceIds.length === 1
            ? `${isReassign ? "Updating" : "Dispatching"} 1 invoice.`
            : `${isReassign ? "Updating" : "Dispatching"} ${invoiceIds.length} invoices.`}
        </p>

        {isLoadingDrivers ? (
          <div
            style={{ fontSize: "0.9rem", color: "#6b7280", padding: "1rem 0" }}
          >
            Loading drivers…
          </div>
        ) : drivers.length === 0 ? (
          <div
            style={{ fontSize: "0.9rem", color: "#6b7280", padding: "1rem 0" }}
          >
            No delivery drivers available.
          </div>
        ) : (
          <select
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              fontSize: "0.9rem",
              marginBottom: "0.75rem",
            }}
          >
            <option value="" disabled>
              Select a driver
            </option>
            {drivers.map((driver) => (
              <option
                key={driver.staffId}
                value={driver.staffId}
              >
                {driver.name} ({driver.staffId})
                {driver.phone ? ` — ${driver.phone}` : ""}
              </option>
            ))}
          </select>
        )}

        {error && (
          <div
            style={{
              fontSize: "0.85rem",
              color: "#b91c1c",
              marginBottom: "0.75rem",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: isReassign ? "space-between" : "flex-end",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.5rem",
          }}
        >
          {isReassign && (
            <button
              onClick={handleReturnToHub}
              disabled={busy}
              title="Send this shipment back to the hub without a driver"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "1px solid #fecaca",
                backgroundColor: isReturning ? "#fca5a5" : "#fef2f2",
                color: "#b91c1c",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {isReturning ? "Returning…" : "Return to Hub"}
            </button>
          )}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={onClose}
              disabled={busy}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "1px solid #d1d5db",
                backgroundColor: "white",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={busy || isLoadingDrivers || drivers.length === 0}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "none",
                backgroundColor: isSubmitting ? "#93c5fd" : "#2563eb",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {isSubmitting
                ? isReassign
                  ? "Updating…"
                  : "Dispatching…"
                : isReassign
                  ? "Confirm Driver"
                  : "Confirm Dispatch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
