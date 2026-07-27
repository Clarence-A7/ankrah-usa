// app/components/ArrivalConfirmModal.tsx
"use client";

// Shown to destination admins the moment they open a packing list for a
// container still In-Transit. No server-only imports here — same rule as
// BeginUnstuffingModal: this file must never import app/lib/session.ts.

import React, { useEffect, useState } from "react";

interface ArrivalConfirmModalProps {
  isOpen: boolean;
  containerId: string;
  // Called immediately with "no-answer" if the admin says No, or after a
  // successful mark-arrived call if they say Yes. Lets the caller navigate
  // an already-open tab either way.
  onResolved: (result: { arrived: boolean }) => void;
  onClose: () => void;
}

const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function ArrivalConfirmModal({
  isOpen,
  containerId,
  onResolved,
  onClose,
}: ArrivalConfirmModalProps) {
  const [step, setStep] = useState<"ask" | "date">("ask");
  const [arrivalDate, setArrivalDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep("ask");
      setArrivalDate(todayISO());
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleNo = () => {
    onResolved({ arrived: false });
  };

  const handleYesClicked = () => setStep("date");

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(arrivalDate);

  const handleConfirmDate = async () => {
    if (!dateValid || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(containerId)}/mark-arrived`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arrivalDate }),
        },
      );
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        onResolved({ arrived: true });
        return;
      }
      setError(data?.error || `Could not mark arrived (HTTP ${res.status}).`);
    } catch {
      setError("Network error — arrival was not recorded. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(32, 33, 36, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          padding: "1.75rem",
          width: "min(400px, calc(100vw - 2rem))",
          boxShadow: "0 8px 28px rgba(0,0,0,0.24)",
        }}
      >
        {step === "ask" ? (
          <>
            <h2
              style={{
                margin: "0 0 0.5rem",
                fontSize: "1.15rem",
                color: "#202124",
              }}
            >
              Has container {containerId} arrived?
            </h2>
            <p
              style={{
                margin: "0 0 1.5rem",
                fontSize: "0.875rem",
                color: "#5f6368",
              }}
            >
              Confirm only if the container is physically at the port right now.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={handleNo}
                style={{
                  padding: "0.55rem 1.1rem",
                  borderRadius: "6px",
                  border: "1px solid #dadce0",
                  background: "#fff",
                  color: "#3c4043",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={handleYesClicked}
                style={{
                  padding: "0.55rem 1.1rem",
                  borderRadius: "6px",
                  border: "none",
                  background: "#1a73e8",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                Yes, it has arrived
              </button>
            </div>
          </>
        ) : (
          <>
            <h2
              style={{
                margin: "0 0 0.25rem",
                fontSize: "1.15rem",
                color: "#202124",
              }}
            >
              Arrival date
            </h2>
            <p
              style={{
                margin: "0 0 1rem",
                fontSize: "0.875rem",
                color: "#5f6368",
              }}
            >
              When did container {containerId} arrive?
            </p>
            <input
              type="date"
              value={arrivalDate}
              max={todayISO()}
              disabled={submitting}
              onChange={(e) => setArrivalDate(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.6rem 0.75rem",
                fontSize: "1rem",
                border: "1px solid #dadce0",
                borderRadius: "6px",
                marginBottom: "1rem",
              }}
            />
            {error && (
              <div
                role="alert"
                style={{
                  backgroundColor: "#fce8e6",
                  color: "#c5221f",
                  borderRadius: "6px",
                  padding: "0.6rem 0.75rem",
                  fontSize: "0.85rem",
                  marginBottom: "1rem",
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
              }}
            >
              <button
                type="button"
                onClick={() => setStep("ask")}
                disabled={submitting}
                style={{
                  padding: "0.55rem 1.1rem",
                  borderRadius: "6px",
                  border: "1px solid #dadce0",
                  background: "#fff",
                  color: "#3c4043",
                  cursor: submitting ? "not-allowed" : "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmDate}
                disabled={!dateValid || submitting}
                style={{
                  padding: "0.55rem 1.1rem",
                  borderRadius: "6px",
                  border: "none",
                  background: dateValid && !submitting ? "#1a73e8" : "#dadce0",
                  color: dateValid && !submitting ? "#fff" : "#80868b",
                  cursor: dateValid && !submitting ? "pointer" : "not-allowed",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                }}
              >
                {submitting ? "Confirming…" : "Confirm Arrival"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
