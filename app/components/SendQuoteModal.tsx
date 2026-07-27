"use client";

import React, { useState } from "react";

interface SendQuoteModalProps {
  request: any;
  onClose: () => void;
  onSent: () => void;
}

// Restyled to match the app-wide modal standard (see DesDriverDispatchModal,
// "Assign Driver"): plain white card, no separate bordered header, blue
// title, gray subtitle, right-aligned Cancel + solid-blue primary button in
// the footer. Plain <button> elements with that reference component's exact
// inline styles, rather than the shared Button component -- matches it
// precisely instead of approximating it.
export default function SendQuoteModal({
  request,
  onClose,
  onSent,
}: SendQuoteModalProps) {
  const isEdit = !!request.isEdit;

  // Prefill with the existing quoted amount when editing, so staff are
  // correcting a visible number rather than re-typing it from memory.
  const [amount, setAmount] = useState(
    isEdit && request.quotedAmount != null ? String(request.quotedAmount) : "",
  );
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFailedResult, setEmailFailedResult] = useState<{
    stripeSessionUrl: string;
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleSend = async () => {
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      const response = await fetch("/api/vehicles/send-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          quotedAmount: parsedAmount,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error || "Something went wrong sending the quote.",
        );
      }
      if (result.emailSent) {
        onSent();
      } else {
        setEmailFailedResult({ stripeSessionUrl: result.stripeSessionUrl });
        setIsSending(false);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong sending the quote.");
      setIsSending(false);
    }
  };

  const handleCopyLink = async () => {
    if (!emailFailedResult) return;
    await navigator.clipboard.writeText(emailFailedResult.stripeSessionUrl);
    setLinkCopied(true);
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
        padding: "1rem",
      }}
      onClick={isSending ? undefined : emailFailedResult ? onSent : onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "1.5rem",
          width: "420px",
          maxWidth: "90vw",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "1.1rem",
            fontWeight: 600,
            color: "#2e63af",
            marginBottom: "0.25rem",
          }}
        >
          {emailFailedResult
            ? isEdit
              ? "Quote Updated"
              : "Quote Sent"
            : isEdit
              ? "Edit Quote"
              : "Send Quote"}
        </h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "#6b7280",
            marginBottom: "1rem",
          }}
        >
          {request.referenceNumber} &middot; {request.vehicleYear}{" "}
          {request.vehicleMake} {request.vehicleModel} &middot;{" "}
          {request.requesterName}
        </p>

        {emailFailedResult ? (
          <>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#92400e",
                backgroundColor: "#fffbeb",
                border: "1px solid #fcd34d",
                borderRadius: "6px",
                padding: "0.75rem",
                margin: "0 0 1rem",
                lineHeight: 1.5,
              }}
            >
              {isEdit
                ? "The quote was updated and this request is still marked Quoted, but the confirmation email didn't go out."
                : "The quote was created and this request is marked Quoted, but the confirmation email didn't go out."}{" "}
              Share this payment link with {request.requesterName} directly:
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                marginBottom: "1.25rem",
              }}
            >
              <input
                type="text"
                readOnly
                value={emailFailedResult.stripeSessionUrl}
                onFocus={(e) => e.target.select()}
                style={{
                  flex: 1,
                  padding: "0.5rem 0.6rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  color: "#374151",
                  backgroundColor: "#f9fafb",
                }}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {linkCopied ? "Copied!" : "Copy"}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={onSent}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#2563eb",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <label
              style={{
                display: "block",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "0.4rem",
              }}
            >
              Quoted Amount (USD)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 2400.00"
              disabled={isSending}
              style={{
                width: "95%",
                padding: "0.6rem 0.75rem",
                border: "1px solid #d1d5db",
                borderRadius: "6px",
                fontSize: "1rem",
                marginBottom: "0.5rem",
              }}
            />

            {error && (
              <p
                style={{
                  color: "#b91c1c",
                  fontSize: "0.8125rem",
                  margin: "0.25rem 0 0.75rem",
                }}
              >
                {error}
              </p>
            )}

            {isEdit && (
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#92400e",
                  backgroundColor: "#fffbeb",
                  border: "1px solid #fcd34d",
                  borderRadius: "6px",
                  padding: "0.6rem 0.75rem",
                  margin: "0.5rem 0",
                  lineHeight: 1.5,
                }}
              >
                This invalidates the previous payment link and emails{" "}
                {request.requesterName} an updated quote. If they already have
                the old email open, that link will no longer work.
              </p>
            )}

            <p
              style={{
                fontSize: "0.8rem",
                color: "#9ca3af",
                margin: "0.5rem 0 1.25rem",
              }}
            >
              This creates a Stripe payment link and emails{" "}
              {request.requesterName} the quote. This can&apos;t be undone from
              here once sent.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "0.5rem",
                marginTop: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                disabled={isSending}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "white",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: isSending ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: isSending ? "#93c5fd" : "#2563eb",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: isSending ? "not-allowed" : "pointer",
                }}
              >
                {isSending
                  ? isEdit
                    ? "Updating..."
                    : "Sending..."
                  : isEdit
                    ? "Update Quote"
                    : "Send Quote"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
