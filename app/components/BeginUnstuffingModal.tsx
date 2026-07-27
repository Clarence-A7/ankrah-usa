// app/components/BeginUnstuffingModal.tsx
"use client";

// SECURITY NOTES
// - This file must NEVER import from app/lib/session.ts (or anything that
//   touches next/headers, jose, or SECRET_KEY). That code is server-only;
//   importing it here is what broke the build — and worse, if it *had*
//   bundled, your JWT plumbing would ship to the browser. All authN/authZ
//   for this action lives in the API route, which re-verifies the session
//   cookie and role on every request. Nothing the client does is trusted.
// - The stored seal number never reaches this component. We only send the
//   admin's submitted value; match/mismatch is decided server-side with a
//   constant-time comparison.
// - Inputs mirror the server's zod limits (length, charset) purely as UX.
//   The server remains the sole enforcer.

import React, { useEffect, useRef, useState } from "react";

interface BeginUnstuffingModalProps {
  isOpen: boolean;
  containerId: string;
  onClose: () => void;
  onCleared: () => void;
}

// Same charset the API's zod schema enforces
const SEAL_PATTERN = /^[A-Za-z0-9-]{3,32}$/;

// Barcode guns often wrap the payload in control characters or whitespace
// (and some prepend/append symbology prefixes). Strip everything that isn't
// in the legal seal charset before validating.
const sanitizeScan = (raw: string): string =>
  raw.replace(/[^A-Za-z0-9-]/g, "").slice(0, 32);

const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function BeginUnstuffingModal({
  isOpen,
  containerId,
  onClose,
  onCleared,
}: BeginUnstuffingModalProps) {
  const [sealNumber, setSealNumber] = useState("");
  const [clearanceDate, setClearanceDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sealMismatch, setSealMismatch] = useState(false);

  const sealInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Reset + focus the seal field every time the modal opens, so the very
  // next trigger pull lands in the right input.
  useEffect(() => {
    if (isOpen) {
      setSealNumber("");
      setClearanceDate("");
      setError(null);
      setSealMismatch(false);
      setSubmitting(false);
      // Delay focus one tick so the element exists after render
      const t = setTimeout(() => sealInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sealValid = SEAL_PATTERN.test(sealNumber);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(clearanceDate);
  const canSubmit = sealValid && dateValid && !submitting;

  const handleVerify = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSealMismatch(false);

    try {
      const res = await fetch(
        `/api/containers/${encodeURIComponent(containerId)}/begin-unstuffing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Session rides on the httpOnly cookie automatically (same-origin).
          // Never attach tokens manually here.
          body: JSON.stringify({ sealNumber, clearanceDate }),
        },
      );

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        onCleared();
        return;
      }

      if (data?.code === "SEAL_MISMATCH") {
        setSealMismatch(true);
        setSealNumber("");
        sealInputRef.current?.focus();
      }
      // Surface the server's message verbatim (it's already written to be
      // safe to display) — including the 429 rate-limit message.
      setError(data?.error || `Verification failed (HTTP ${res.status}).`);
    } catch {
      setError(
        "Network error — the verification did not go through. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Barcode guns emulate a keyboard and send Enter after the code.
  // On the seal field, Enter must NOT submit (the date isn't filled yet) —
  // it advances focus to the clearance date instead.
  const onSealKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      dateInputRef.current?.focus();
    }
  };

  const onDateKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleVerify();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unstuff-modal-title"
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
        // Click on backdrop closes — but not while a request is in flight
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          padding: "1.75rem",
          width: "min(440px, calc(100vw - 2rem))",
          boxShadow: "0 8px 28px rgba(0,0,0,0.24)",
        }}
      >
        <h2
          id="unstuff-modal-title"
          style={{
            margin: "0 0 0.25rem",
            fontSize: "1.2rem",
            color: "#202124",
          }}
        >
          Open Container
        </h2>
        <p
          style={{
            margin: "0 0 1.25rem",
            fontSize: "0.875rem",
            color: "#5f6368",
          }}
        >
          Scan or type the seal number exactly as it appears on the physical
          seal, then enter the customs clearance date.
        </p>

        {/* Not a <form>: forms auto-submit on the scanner's Enter suffix,
            which is exactly the bug we're avoiding. */}
        <label
          htmlFor="seal-input"
          style={{
            display: "block",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#3c4043",
            marginBottom: "0.25rem",
          }}
        >
          Seal number
        </label>
        <input
          id="seal-input"
          ref={sealInputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          value={sealNumber}
          disabled={submitting}
          onChange={(e) => setSealNumber(sanitizeScan(e.target.value))}
          onKeyDown={onSealKeyDown}
          placeholder="Scan seal barcode…"
          aria-invalid={sealNumber.length > 0 && !sealValid}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "0.6rem 0.75rem",
            fontSize: "1rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.05em",
            border: `1px solid ${sealMismatch ? "#d93025" : "#dadce0"}`,
            borderRadius: "6px",
            marginBottom: "1rem",
          }}
        />

        <label
          htmlFor="clearance-date-input"
          style={{
            display: "block",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#3c4043",
            marginBottom: "0.25rem",
          }}
        >
          Customs clearance date
        </label>
        <input
          id="clearance-date-input"
          ref={dateInputRef}
          type="date"
          value={clearanceDate}
          disabled={submitting}
          max={todayISO()}
          onChange={(e) => setClearanceDate(e.target.value)}
          onKeyDown={onDateKeyDown}
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
          style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: "0.55rem 1rem",
              borderRadius: "6px",
              border: "1px solid #dadce0",
              background: "#fff",
              color: "#3c4043",
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: "0.9rem",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={!canSubmit}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "6px",
              border: "none",
              background: canSubmit ? "#1a73e8" : "#dadce0",
              color: canSubmit ? "#fff" : "#80868b",
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
          >
            {submitting ? "Verifying…" : "Verify seal & clear"}
          </button>
        </div>
      </div>
    </div>
  );
}
