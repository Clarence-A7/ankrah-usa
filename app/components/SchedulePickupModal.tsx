"use client";

import React, { useEffect, useMemo, useState } from "react";
import { schedulePickup } from "../actions/pickup";

interface SchedulePickupModalProps {
  isOpen: boolean;
  invoiceId: string | null;
  invoiceNumber?: string;
  /** ISO string of the currently-set pickup, if any (enables "reschedule" copy + prefill). */
  currentScheduledAt?: string | null;
  onClose: () => void;
  onScheduled: () => void;
}

// A <input type="datetime-local"> wants/returns "YYYY-MM-DDTHH:mm" in LOCAL time.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export function SchedulePickupModal({
  isOpen,
  invoiceId,
  invoiceNumber,
  currentScheduledAt,
  onClose,
  onScheduled,
}: SchedulePickupModalProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Minimum selectable = ~5 minutes from now (server also enforces "future").
  const minValue = useMemo(
    () => toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000)),
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsSubmitting(false);
    setValue(
      currentScheduledAt ? toLocalInputValue(new Date(currentScheduledAt)) : "",
    );
  }, [isOpen, currentScheduledAt]);

  if (!isOpen) return null;

  const isReschedule = Boolean(currentScheduledAt);

  const handleConfirm = async () => {
    if (!value || !invoiceId) {
      setError("Please choose a pickup date and time.");
      return;
    }
    const when = new Date(value); // local → Date
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError("Please choose a future date and time.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await schedulePickup(invoiceId, when.toISOString());

    setIsSubmitting(false);

    if (!result.success) {
      setError(result.error || "Failed to schedule pickup.");
      return;
    }

    onScheduled();
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
          style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.25rem" }}
        >
          {isReschedule ? "Reschedule Pickup" : "Schedule Pickup"}
        </h2>
        <p
          style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "1rem" }}
        >
          {invoiceNumber
            ? `Set the first-mile pickup date & time for ${invoiceNumber}.`
            : "Set the first-mile pickup date & time."}
        </p>

        <input
          type="datetime-local"
          value={value}
          min={minValue}
          onChange={(e) => setValue(e.target.value)}
          style={{
            width: "100%",
            padding: "0.5rem",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            fontSize: "0.9rem",
            marginBottom: "0.75rem",
          }}
        />

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
            disabled={isSubmitting || !value}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "6px",
              border: "none",
              backgroundColor: isSubmitting ? "#93c5fd" : "#2563eb",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: isSubmitting || !value ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting
              ? "Saving…"
              : isReschedule
                ? "Update Pickup"
                : "Schedule Pickup"}
          </button>
        </div>
      </div>
    </div>
  );
}
