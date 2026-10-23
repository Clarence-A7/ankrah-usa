"use client";

import React, { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";

interface PodViewerModalProps {
  isOpen: boolean;
  shipmentId: string | null;
  invoiceNumber: string;
  onClose: () => void;
}

export default function PodViewerModal({
  isOpen,
  shipmentId,
  invoiceNumber,
  onClose,
}: PodViewerModalProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !shipmentId) return;
    let cancelled = false;
    setState("loading");
    setPhoto(null);
    setError("");
    (async () => {
      try {
        const res = await fetch(`/api/shipments/${shipmentId}/pod`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Could not load the delivery photo.");
        if (cancelled) return;
        setPhoto(data.photo);
        setCapturedAt(data.capturedAt ?? null);
        setState("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load the delivery photo.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, shipmentId]);

  if (!isOpen) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Proof of delivery">
        <div style={header}>
          <span style={{ fontWeight: 700, color: "#0f172a" }}>
            Proof of Delivery — {invoiceNumber}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" style={closeBtn}>
            <X size={18} />
          </button>
        </div>

        {state === "loading" && (
          <div style={center}>
            <Loader2 size={20} className="spin" /> <span>Loading photo…</span>
          </div>
        )}

        {state === "error" && (
          <div style={{ ...center, color: "#b91c1c" }}>
            <AlertTriangle size={18} /> <span>{error}</span>
          </div>
        )}

        {state === "ready" && photo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={`Proof of delivery for ${invoiceNumber}`}
              style={{ width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", display: "block" }}
            />
            {capturedAt && (
              <p style={{ margin: "0.6rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                Captured {new Date(capturedAt).toLocaleString()}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
  zIndex: 1000,
};
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "1.25rem",
  maxWidth: 520,
  width: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
};
const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.9rem",
};
const closeBtn: React.CSSProperties = {
  border: "none",
  background: "none",
  cursor: "pointer",
  color: "#64748b",
};
const center: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  justifyContent: "center",
  padding: "2rem 1rem",
  color: "#475569",
  fontSize: "0.9rem",
};
