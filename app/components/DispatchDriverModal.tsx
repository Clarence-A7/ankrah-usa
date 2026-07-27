"use client";

import React, { useEffect, useState } from "react";
import {
  getAvailableDrivers,
  dispatchInvoices,
  DriverOption,
} from "../actions/pickup";

interface DispatchDriverModalProps {
  isOpen: boolean;
  invoiceIds: string[];
  onClose: () => void;
  onDispatched: () => void;
  // "reassign" re-uses this modal to change the driver on an already-dispatched
  // invoice; the caller passes it to distinguish the two flows.
  mode?: "dispatch" | "reassign";
}

export function DispatchDriverModal({
  isOpen,
  invoiceIds,
  onClose,
  onDispatched,
}: DispatchDriverModalProps) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSelectedStaffId("");
    setIsLoadingDrivers(true);

    getAvailableDrivers()
      .then((result) => setDrivers(result))
      .catch(() => setError("Could not load drivers. Please try again."))
      .finally(() => setIsLoadingDrivers(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!selectedStaffId) {
      setError("Please select a driver.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await dispatchInvoices(invoiceIds, selectedStaffId);

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to dispatch.");
      return;
    }

    onDispatched();
    onClose();
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
      onClick={onClose}
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
          Assign Driver
        </h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "#6b7280",
            marginBottom: "1rem",
          }}
        >
          {invoiceIds.length === 1
            ? "Dispatching 1 invoice."
            : `Dispatching ${invoiceIds.length} invoices.`}
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
            No drivers available.
          </div>
        ) : (
          <select
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
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
              <option key={driver.staffId} value={driver.staffId}>
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
            justifyContent: "flex-end",
            gap: "0.5rem",
            marginTop: "0.5rem",
          }}
        >
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              backgroundColor: "white",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || isLoadingDrivers || drivers.length === 0}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              border: "none",
              backgroundColor: isSubmitting ? "#93c5fd" : "#2563eb",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Dispatching…" : "Confirm Dispatch"}
          </button>
        </div>
      </div>
    </div>
  );
}
