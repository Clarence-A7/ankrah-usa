// app/dev/print-test/page.tsx
//
// Dev-only page: http://localhost:3000/dev/print-test
// Lets you preview exactly what a real printer would receive, with zero
// hardware. Not linked from any nav — visit the URL directly, and consider
// gating it behind NODE_ENV !== "production" or removing before deploy.

"use client";

import React, { useState } from "react";
import { notFound } from "next/navigation";
import {
  buildItemLabelBytes,
  type PrintableItemLabel,
} from "../../../lib/escpos-printer";
import { decodeEscPosBytes } from "../../../lib/escpos-mock-printer";
import { EscPosMockReceipt } from "../EscPosMockReceipt";

// Sample manifest mirroring a real shipment's items, so the test exercises
// the same shape the modal will pass in (see CollectConfirmModal.tsx).
const SAMPLE_ITEMS = [
  { id: "item_1", itemType: "Bluetooth Speaker", quantity: 4 },
  { id: "item_2", itemType: "Bedside Lamp", quantity: 2 },
  { id: "item_3", itemType: "Office Chair", quantity: 1 },
];

const SAMPLE_INVOICE = "PA85832";

/**
 * Mirrors printItemLabels' loop/progress behavior, but writes each label's
 * bytes into an in-memory array instead of opening a Bluetooth connection.
 * This is how you test the modal's print-progress UX without hardware.
 */
async function printToMockTransport(
  labels: PrintableItemLabel[],
  onProgress: (printed: number, total: number) => void,
): Promise<Uint8Array[]> {
  const captured: Uint8Array[] = [];
  for (let i = 0; i < labels.length; i++) {
    const bytes = buildItemLabelBytes(labels[i]);
    // simulate the latency of a real BLE write so progress UI is testable
    await new Promise((resolve) => setTimeout(resolve, 300));
    captured.push(bytes);
    onProgress(i + 1, labels.length);
  }
  return captured;
}

export default function PrintTestPage() {
  // Dev-only diagnostic route — never expose in production.
  if (process.env.NODE_ENV === "production") notFound();

  const [printedBytesList, setPrintedBytesList] = useState<Uint8Array[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [isPrinting, setIsPrinting] = useState(false);

  const runMockPrint = async () => {
    setIsPrinting(true);
    setPrintedBytesList([]);
    setProgress({ done: 0, total: SAMPLE_ITEMS.length });

    const labels: PrintableItemLabel[] = SAMPLE_ITEMS.map((item, index) => ({
      itemType: item.itemType,
      sequenceNumber: index + 1,
      totalItems: SAMPLE_ITEMS.length,
      invoiceNumber: SAMPLE_INVOICE,
      qrPayload: {
        itemId: item.id,
        invoiceNumber: SAMPLE_INVOICE,
        itemType: item.itemType,
        quantity: item.quantity,
      },
    }));

    const results = await printToMockTransport(labels, (done, total) =>
      setProgress({ done, total }),
    );

    setPrintedBytesList(results);
    setIsPrinting(false);
  };

  return (
    <div style={{ padding: 32, fontFamily: "system-ui", maxWidth: 960 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>
        ESC/POS Print Test (no hardware)
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
        Generates the exact byte sequence <code>buildItemLabelBytes()</code>{" "}
        would send to a real printer, decodes it, and renders each label as it
        would physically print — including a real scannable QR code.
      </p>

      <button
        onClick={runMockPrint}
        disabled={isPrinting}
        style={{
          padding: "10px 18px",
          borderRadius: 8,
          border: "none",
          background: isPrinting ? "#aebee3" : "#1d5fd9",
          color: "#fff",
          fontWeight: 700,
          cursor: isPrinting ? "not-allowed" : "pointer",
          marginBottom: 24,
        }}
      >
        {isPrinting
          ? `Printing label ${progress.done} of ${progress.total}…`
          : "Run mock print (3 items)"}
      </button>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {printedBytesList.map((bytes, index) => {
          const instructions = decodeEscPosBytes(bytes);
          return (
            <div key={index}>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
                Label {index + 1} — {bytes.length} bytes
              </p>
              <EscPosMockReceipt instructions={instructions} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
