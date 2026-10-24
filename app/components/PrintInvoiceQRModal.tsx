"use client";

import React, { useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react"; // named export in qrcode.react v3+ — generates QR client-side, no data leaves the browser
import { X, Printer } from "lucide-react";

interface QRModalItem {
  id: string;
  itemType: string;
  quantity: number;
}

interface QRInvoiceGroup {
  invoiceNumber: string;
  items: QRModalItem[];
}

interface PrintInvoiceQRModalProps {
  invoices: QRInvoiceGroup[];
  onClose: () => void;
}

// Must match the shape lib/label-parser.ts expects for JSON QR labels, so
// the container-loading scanner (parseItemLabel) can read these directly.
// Field names are invoiceNumber / itemType / itemId / quantity — not
// abbreviated (inv/type) — to match what the loading terminal destructures.
// Still deliberately excludes PII: no consigner/consignee name, phone,
// email, or address is ever encoded, since a printed label can be lost,
// photographed, or left on a pallet.
function buildQrPayload(
  invoiceNumber: string,
  item: QRModalItem,
  pieceId: string,
) {
  return JSON.stringify({
    invoiceNumber,
    itemType: item.itemType,
    // Unique per physical piece so each barrel/box carries its own label and
    // the scanner can dedupe at the piece level if/when that's enabled.
    itemId: pieceId,
    // Each QR represents exactly ONE physical piece.
    quantity: 1,
  });
}

export default function PrintInvoiceQRModal({
  invoices,
  onClose,
}: PrintInvoiceQRModalProps) {
  // One QR per PHYSICAL PIECE, not per item row: a "Barrel ×10" line prints 10
  // separate labels (Piece 1..10), "2 Barrels + 2 Boxes" prints 4 — each
  // carrying its own item name, so every piece gets its own sticker to scan.
  const invoiceGroups = useMemo(
    () =>
      invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        entries: inv.items.flatMap((item) => {
          const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
          return Array.from({ length: qty }, (_, i) => {
            const pieceId = `${item.id}-${i + 1}`;
            return {
              item,
              pieceId,
              pieceIndex: i + 1,
              pieceTotal: qty,
              payload: buildQrPayload(inv.invoiceNumber, item, pieceId),
            };
          });
        }),
      })),
    [invoices],
  );

  // Total QR codes to be printed (one per piece).
  const totalItemCount = invoiceGroups.reduce(
    (sum, group) => sum + group.entries.length,
    0,
  );

  const isBulk = invoices.length > 1;
  const headerTitle = isBulk
    ? `QR Codes — ${invoices.length} Invoices`
    : `QR Codes — Invoice ${invoices[0]?.invoiceNumber ?? ""}`;

  const handlePrint = () => window.print();

  return (
    <div className="qrModalOverlay" role="dialog" aria-modal="true">
      <div className="qrModalPanel">
        <div className="qrModalHeader">
          <h2>{headerTitle}</h2>
          <div className="qrModalHeaderActions">
            <button type="button" onClick={handlePrint} className="qrPrintBtn">
              <Printer size={16} />
              Print
            </button>
            <button
              type="button"
              onClick={onClose}
              className="qrCloseBtn"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {totalItemCount === 0 ? (
          <p className="qrEmptyState">No manifest items to print.</p>
        ) : (
          <div className="qrPrintWrapper">
            {invoiceGroups.map((group) => (
              <div key={group.invoiceNumber} className="qrInvoiceGroup">
                {isBulk && (
                  <h3 className="qrInvoiceGroupTitle">
                    Invoice {group.invoiceNumber}
                  </h3>
                )}
                {group.entries.length === 0 ? (
                  <p className="qrEmptyState">
                    No manifest items on this invoice.
                  </p>
                ) : (
                  <div className="qrPrintGrid">
                    {group.entries.map((entry) => (
                      <div key={entry.pieceId} className="qrPrintCard">
                        <QRCodeCanvas
                          value={entry.payload}
                          size={140}
                          level="M"
                          includeMargin
                        />
                        <p className="qrCardLabel">{entry.item.itemType}</p>
                        <p className="qrCardSub">
                          {entry.pieceTotal > 1
                            ? `Piece ${entry.pieceIndex} of ${entry.pieceTotal} · `
                            : ""}
                          Inv: {group.invoiceNumber}
                        </p>
                        <p className="qrCardBrand">Shipped by Ankrah F&L</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Print-only styling: hides everything except the QR grids when printing */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .qrPrintWrapper,
          .qrPrintWrapper * {
            visibility: visible;
          }
          .qrPrintWrapper {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          .qrInvoiceGroup {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        .qrModalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .qrModalPanel {
          background: #fff;
          border-radius: 12px;
          padding: 1.5rem;
          max-width: 720px;
          width: 90%;
          max-height: 85vh;
          overflow-y: auto;
        }
        .qrModalHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .qrModalHeaderActions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .qrPrintBtn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.875rem;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          cursor: pointer;
        }
        .qrCloseBtn {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
        }
        .qrPrintWrapper {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .qrInvoiceGroupTitle {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #111827;
          margin: 0 0 0.5rem;
          padding-bottom: 0.375rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .qrPrintGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 1rem;
        }
        .qrPrintCard {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 0.75rem;
          text-align: center;
        }
        .qrCardLabel {
          font-weight: 600;
          font-size: 0.8125rem;
          margin: 0.5rem 0 0.125rem;
        }
        .qrCardSub {
          font-size: 0.75rem;
          color: #6b7280;
          margin: 0;
        }
        .qrCardBrand {
          font-size: 0.6875rem;
          font-style: italic;
          color: #9ca3af;
          margin: 0.375rem 0 0;
          padding-top: 0.375rem;
          border-top: 1px dashed #e5e7eb;
        }
        .qrEmptyState {
          font-size: 0.875rem;
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
