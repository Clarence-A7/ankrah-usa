// components/dev/EscPosMockReceipt.tsx
"use client";

// Renders decoded ESC/POS instructions as a mock thermal-paper label, with a
// real scannable QR code (via the `qrcode` package). This is a development
// tool for visually checking label content/layout before printing on real
// hardware — it is NOT used in the production print path.
//
// Usage in a throwaway dev page:
//
//   import { buildItemLabelBytes } from "@/lib/escpos-printer";
//   import { decodeEscPosBytes } from "@/lib/escpos-mock-printer";
//   import { EscPosMockReceipt } from "@/components/dev/EscPosMockReceipt";
//
//   const bytes = buildItemLabelBytes({
//     itemType: "Bluetooth Speaker",
//     sequenceNumber: 2,
//     totalItems: 4,
//     invoiceNumber: "PA85832",
//     qrPayload: { itemId: "item_abc123", invoiceNumber: "PA85832", itemType: "Bluetooth Speaker", quantity: 4 },
//   });
//   const instructions = decodeEscPosBytes(bytes);
//   <EscPosMockReceipt instructions={instructions} />
//
// Requires: npm install qrcode (and @types/qrcode for TS)

import React, { useEffect, useRef } from "react";
import QRCode from "qrcode";
import type { DecodedInstruction } from "../../lib/escpos-mock-printer";

interface EscPosMockReceiptProps {
  instructions: DecodedInstruction[];
}

export function EscPosMockReceipt({ instructions }: EscPosMockReceiptProps) {
  return (
    <div
      style={{
        width: 280,
        background: "#fdfdf8",
        padding: "16px 14px",
        fontFamily: "'Courier New', monospace",
        color: "#1a1a1a",
        boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
        // jagged torn-paper edges, top and bottom, for the "thermal label" feel
        clipPath:
          "polygon(0% 2%, 4% 0%, 8% 2%, 12% 0%, 16% 2%, 20% 0%, 24% 2%, 28% 0%, 32% 2%, 36% 0%, 40% 2%, 44% 0%, 48% 2%, 52% 0%, 56% 2%, 60% 0%, 64% 2%, 68% 0%, 72% 2%, 76% 0%, 80% 2%, 84% 0%, 88% 2%, 92% 0%, 96% 2%, 100% 0%, 100% 98%, 96% 100%, 92% 98%, 88% 100%, 84% 98%, 80% 100%, 76% 98%, 72% 100%, 68% 98%, 64% 100%, 60% 98%, 56% 100%, 52% 98%, 48% 100%, 44% 98%, 40% 100%, 36% 98%, 32% 100%, 28% 98%, 24% 100%, 20% 98%, 16% 100%, 12% 98%, 8% 100%, 4% 98%, 0% 100%)",
      }}
    >
      {instructions.map((instr, index) => {
        if (instr.type === "qr") {
          return <MockQrBlock key={index} data={instr.data} />;
        }

        if (instr.type === "text") {
          return (
            <div
              key={index}
              style={{
                textAlign: instr.align,
                fontWeight: instr.bold ? 700 : 400,
                fontSize: instr.doubleHeight ? 22 : 13,
                lineHeight: 1.35,
                whiteSpace: "pre-wrap",
              }}
            >
              {instr.value}
            </div>
          );
        }

        if (instr.type === "feed") {
          return <div key={index} style={{ height: instr.lines * 10 }} />;
        }

        // cut: render a dashed tear line marker
        return (
          <div
            key={index}
            style={{
              borderTop: "1px dashed #999",
              marginTop: 6,
              fontSize: 9,
              color: "#999",
              textAlign: "center",
              paddingTop: 2,
            }}
          >
            ✂ cut here
          </div>
        );
      })}
    </div>
  );
}

function MockQrBlock({ data }: { data: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, data, {
      width: 160,
      margin: 1,
      errorCorrectionLevel: "L", // matches the 'L' level set in buildQrCodeCommand
    }).catch((err) => {
      console.error("Failed to render mock QR code:", err);
    });
  }, [data]);

  return (
    <div
      style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
