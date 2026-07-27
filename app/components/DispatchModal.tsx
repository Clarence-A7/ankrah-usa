"use client";

import React, { useState } from "react";
import styles from "./styles/DispatchModal.module.css"; // Using your dashboard style baseline
import Button from "./ui/Button"; // Reusable custom design engine button

interface Driver {
  id: string;
  name: string;
  vehicle: string;
}

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInvoices: string[];
  drivers: Driver[]; // Injected dynamically to avoid hard-coded drivers
  onConfirmDispatch: (invoiceIds: string[], driverId: string) => void;
}

export function DispatchModal({
  isOpen,
  onClose,
  selectedInvoices,
  drivers,
  onConfirmDispatch,
}: DispatchModalProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriverId) return;
    onConfirmDispatch(selectedInvoices, selectedDriverId);
    setSelectedDriverId(""); // Reset state
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "2rem",
          borderRadius: "8px",
          width: "100%",
          maxWidth: "450px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}
      >
        <h2
          style={{
            margin: "0 0 1rem 0",
            color: "#202124",
            fontSize: "1.35rem",
          }}
        >
          Assign Dispatch Assignment
        </h2>

        <div
          style={{
            backgroundColor: "#f1f3f4",
            padding: "0.75rem",
            borderRadius: "4px",
            marginBottom: "1.25rem",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#5f6368" }}>
            Invoices Selected for Route Delivery:
          </p>
          <strong style={{ fontSize: "0.95rem", color: "#202124" }}>
            {selectedInvoices.join(", ")}
          </strong>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label
              htmlFor="driverSelect"
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#202124",
              }}
            >
              Select Active Driver
            </label>
            <select
              id="driverSelect"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "0.6rem",
                borderRadius: "4px",
                border: "1px solid #chd1d5",
                backgroundColor: "#fff",
                fontSize: "0.95rem",
              }}
            >
              <option value="" disabled>
                -- Choose a verified driver --
              </option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} ({driver.vehicle})
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
            }}
          >
            <Button
              variant="primary"
              type="button"
              onClick={onClose}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                border: "1px solid #dadce0",
                backgroundColor: "#fff",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Cancel
            </Button>
            <button
              type="submit"
              disabled={!selectedDriverId}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                border: "none",
                backgroundColor: selectedDriverId ? "#1a73e8" : "#9aa0a6",
                color: "#fff",
                cursor: selectedDriverId ? "pointer" : "not-allowed",
                fontWeight: 500,
              }}
            >
              Confirm Dispatch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
