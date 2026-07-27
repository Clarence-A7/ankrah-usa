// app/components/PrintLetterhead.tsx
"use client";

// Reusable wrapper for anything that needs to print or "Save as PDF" with
// a consistent company letterhead. Centralizes:
//   1. The print-isolation trick (hide the whole document, show only this
//      component's subtree) — works regardless of what layout/sidebar
//      wraps the page, since it targets `body *` globally rather than
//      needing every ancestor to cooperate.
//   2. Letter-portrait page setup (not landscape, not metric margins).
//   3. The letterhead itself — logo + company name + contact block —
//      shown only in print/PDF output, never on screen.
//
// Usage:
//   <PrintLetterhead
//     documentLabel="Packing List"
//     referenceLine={`Container: ${containerId} · Printed ${new Date().toLocaleString()}`}
//     screenHeader={<div>...on-screen h1 + badges + buttons...</div>}
//   >
//     <Table columns={visibleColumns} data={invoiceData} />
//   </PrintLetterhead>

import React from "react";

// ---------------------------------------------------------------------
// COMPANY LETTERHEAD DETAILS — single source of truth.
// Update these once; every page using PrintLetterhead picks up the change.
// Logo is the white/reversed mark, meant to sit on the blue letterhead
// band below — swap LOGO_SRC if that changes, but keep it a light/white
// asset or the header background will need to change with it.
// ---------------------------------------------------------------------
const LOGO_SRC = "/ankrahWhite.svg";
const BRAND_BLUE = "#2e63af";
const COMPANY = {
  name: "Ankrah F&L",
  email: "contact@ankrahfl.com",
  website: "www.ankrahfl.com",
};
const USA = {
  address: "Macungie, PA",
  email: "usa@ankrahfl.com",
  phone: "+1 484 935 4392",
};
const Ghana = {
  address: "MA 474, South West Macarthy, Accra",
  phone: "+233 053 048 2082",
  email: "ghana@ankrahfl.com",
};

interface PrintLetterheadProps {
  /** Short document type shown under the company name, e.g. "Packing List" */
  documentLabel: string;
  /** e.g. "Container: OCLU456321 · Printed 7/9/2026, 11:40 AM" */
  referenceLine?: string;
  /** On-screen-only heading/badges/action buttons — hidden entirely when printing */
  screenHeader?: React.ReactNode;
  children: React.ReactNode;
}

export function PrintLetterhead({
  documentLabel,
  referenceLine,
  screenHeader,
  children,
}: PrintLetterheadProps) {
  return (
    <div id="printableArea" style={{ padding: "2rem" }}>
      <style>{`
        .print-only { display: none !important; }
        @media print {
          /* Isolation: hide everything, re-show only this subtree.
             visibility (not display) keeps layout flow intact so nothing
             collapses unpredictably before printableArea is pulled out. */
          body * { visibility: hidden; }
          #printableArea, #printableArea * { visibility: visible; }
          #printableArea {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 1rem;
          }

          .no-print { display: none !important; }
          .print-only { display: block !important; }
          /* More specific than .print-only above, so this wins on print:
             the band needs flex for its two-column layout, not block. */
          .print-only.letterhead-band { display: flex !important; }

          /* Undo the on-screen horizontal-scroll container — print
             doesn't scroll, so anything clipped there would silently
             vanish from the printed/PDF output. */
          #printableArea * { overflow: visible !important; }

          #printableArea table {
            width: 95% !important;
            font-size: 1rem !important;
            margin-right: 2rem !important;
          }
          #printableArea table td,
          #printableArea table th {
            padding: 5px 8px !important;
          }

          @page {
            size: letter;
            margin: 0;
          }

          /* Solid background fills don't print by default in most
             browsers unless the user has "Background graphics" enabled
             in the print dialog — flag this in the UI rather than assume
             it always renders (see note below the component). */
          .letterhead-band {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            /* Bleed through #printableArea's own 1rem padding so the band
               spans the full printable page width instead of sitting
               inset inside it. !important is needed here because the
               inline marginBottom style below otherwise wins. */
            margin: -2rem -1rem 1.25rem -3rem !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      {/* Letterhead — print/PDF only, never shown on screen.
          Two-column layout: logo + wordmark on the left, contact block
          right-aligned, matching the reference design. White text
          throughout — this band has a dark blue background, so the
          body's usual dark text colors would be unreadable here. */}
      <div
        className="print-only letterhead-band"
        style={{
          marginBottom: "1.25rem",
          background: `linear-gradient(135deg, #4a7bc8 0%, ${BRAND_BLUE} 55%, #1f4a8f 100%)`,
          padding: "1.5rem 5rem",
          display: "flex",
          alignItems: "center",
          alignContent: "center",
          justifyContent: "space-between",
          gap: "1.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_SRC}
            alt={`${COMPANY.name} logo`}
            style={{
              height: "70px",
              width: "auto",
            }}
          />
        </div>

        <div
          style={{
            textAlign: "left",
            color: "#ffffff",
            fontSize: "0.85rem",
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          <div>{USA.address}</div>
          <div>{USA.email}</div>
          <div>{USA.phone}</div>
          <div>{COMPANY.website}</div>
        </div>

        <div
          style={{
            textAlign: "right",
            color: "#ffffff",
            fontSize: "0.85rem",
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          <div>{Ghana.address}</div>
          <div>{Ghana.email}</div>
          <div>{Ghana.phone}</div>
          <div>{COMPANY.website}</div>
        </div>
      </div>

      <div className="print-only">
        {documentLabel && (
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "#202124",
              marginBottom: referenceLine ? 0 : "1rem",
            }}
          >
            {documentLabel}
          </div>
        )}
        {referenceLine && (
          <div
            style={{
              fontSize: "0.8rem",
              color: "#5f6368",
              marginBottom: "1rem",
            }}
          >
            {referenceLine}
          </div>
        )}
      </div>

      {/* On-screen heading/actions — hidden entirely when printing */}
      {screenHeader && <div className="no-print">{screenHeader}</div>}

      {children}
    </div>
  );
}
