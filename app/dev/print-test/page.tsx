// app/dev/print-test/page.tsx
//
// Dev-only page: http://localhost:3000/dev/print-test
// Opened automatically (window.open) when a driver clicks "Confirm & Print"
// in CollectConfirmModal with simulatePrint enabled. Renders each label as
// it's "printed" in real time, so you can visually confirm the modal's
// progress and this page's output are in sync — no hardware required.
//
// Not linked from any nav — gate behind NODE_ENV !== "production" or
// delete this route before shipping.

"use client";

import React, { useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { decodeEscPosBytes } from "../../lib/escpos-mock-printer";
import { EscPosMockReceipt } from "../../components/dev/EscPosMockReceipt";
import {
  subscribeToPrintBusWithReplay,
  type PrintBusLabel,
} from "../../lib/print-bus";

interface JobState {
  invoiceNumber: string;
  shipmentId: string;
  totalItems: number;
  labels: PrintBusLabel[];
  finishedAt: string | null;
}

export default function PrintTestPage() {
  // Dev-only diagnostic route — never expose in production.
  if (process.env.NODE_ENV === "production") notFound();

  const [job, setJob] = useState<JobState | null>(null);
  // Tracks elapsed-time display without re-deriving it from scratch each render.
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToPrintBusWithReplay((message) => {
      if (message.type === "job-started") {
        startedAtRef.current = Date.now();
        setJob({
          invoiceNumber: message.invoiceNumber,
          shipmentId: message.shipmentId,
          totalItems: message.totalItems,
          labels: [],
          finishedAt: null,
        });
        return;
      }

      if (message.type === "label-printed") {
        setJob((prev) =>
          prev ? { ...prev, labels: [...prev.labels, message.label] } : prev,
        );
        return;
      }

      if (message.type === "job-finished") {
        setJob((prev) =>
          prev ? { ...prev, finishedAt: new Date().toISOString() } : prev,
        );
      }
    });

    return unsubscribe;
  }, []);

  return (
    <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 980 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>
        ESC/POS Print Test (no hardware)
      </h1>
      <p
        style={{ color: "#666", fontSize: 14, marginBottom: 28, maxWidth: 640 }}
      >
        This tab opens automatically when a driver clicks Confirm &amp; Print in
        simulate mode. Labels appear below the instant each one would have
        printed — watch this alongside the "Printing label X of Y" progress in
        the modal to confirm they're in sync.
      </p>

      {!job ? (
        <div
          style={{
            border: "1px dashed #d6dce5",
            borderRadius: 12,
            padding: "40px 24px",
            textAlign: "center",
            color: "#888",
            fontSize: 13.5,
          }}
        >
          Waiting for a print job… Go to My Pickups, click Collect on a
          shipment, then Confirm &amp; Print. This page updates live — no
          refresh needed.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
              fontSize: 13.5,
              color: "#2c3445",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: job.finishedAt ? "#16a34a" : "#1d5fd9",
                display: "inline-block",
                animation: job.finishedAt ? "none" : "pulse 1.2s infinite",
              }}
            />
            <span>
              Invoice <strong>{job.invoiceNumber}</strong> — printed{" "}
              {job.labels.length} of {job.totalItems} label
              {job.totalItems === 1 ? "" : "s"}
              {job.finishedAt ? " — done" : "…"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {job.labels.map((label, index) => {
              const bytes = new Uint8Array(label.bytes);
              const instructions = decodeEscPosBytes(bytes);
              return (
                <div key={index}>
                  <p style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
                    Label {label.sequenceNumber} / {label.totalItems} —{" "}
                    {bytes.length} bytes
                  </p>
                  <EscPosMockReceipt instructions={instructions} />
                </div>
              );
            })}
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
