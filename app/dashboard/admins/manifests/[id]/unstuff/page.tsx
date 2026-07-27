// app/dashboard/admins/manifests/[id]/unstuff/page.tsx
// Phone-first unstuffing screen: live camera QR/barcode scanning via
// html5-qrcode, with manual entry as fallback. Each successful read fires
// the same secured /scan-receive endpoint — the camera is just an input
// method; all validation stays server-side.
//
// Install first:  npm install html5-qrcode

"use client";

import React, { use, useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "../../../../../components/ui/Badge";
import Button from "../../../../../components/ui/Button";
import { useAuth } from "../../../../../components/providers/AuthProvider";
import { parseItemLabel } from "../../../../../lib/label-parser";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraIcon } from "lucide-react";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  consigneeName: string;
  destinationCity: string;
  status: string;
}

const norm = (s: string | undefined | null): string =>
  (s || "").toUpperCase().replace(/[\s-]/g, "_");

// Statuses that mean "this invoice has been scanned in at the Ghana hub
// (or has already moved past that point)". Anything else in this
// container's manifest is still physically inside the box.
const RECEIVED_OR_LATER = [
  "RECEIVED_AT_HUB",
  "RETURNED_TO_HUB",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

type Feedback = { kind: "ok" | "warn" | "error"; text: string } | null;

const SCANNER_DIV_ID = "qr-scanner-region";
// Ignore repeat reads of the same code within this window — the camera
// decodes several times per second while the label is in frame.
const DUPLICATE_COOLDOWN_MS = 4000;

export default function UnstuffScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const containerId = resolvedParams.id;

  // Client-side role check is UX only — the scan API re-verifies server-side
  const { user } = useAuth();
  const isDestAdmin = ["destination_admin", "super_admin"].includes(
    user?.role || "",
  );

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [containerStatus, setContainerStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [scanValue, setScanValue] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Container-wide piece progress, kept from each scan response — this is
  // the accurate completion signal now, not just invoice count.
  const [piecesRemaining, setPiecesRemaining] = useState<number | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Refs (not state) for values the camera callback reads — the callback
  // is registered once and would otherwise close over stale state.
  const busyRef = useRef(false);
  const lastScansRef = useRef<Map<string, number>>(new Map());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/containers/invoices?containerId=${encodeURIComponent(containerId)}`,
      );
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setInvoices(data.invoices || []);
      setContainerStatus(data.container?.status || "");
    } catch (err) {
      console.error("❌ Unstuff page load failure:", err);
      setFeedback({ kind: "error", text: "Failed to load container data." });
    } finally {
      setLoading(false);
    }
  }, [containerId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------- Core: submit one scan to the scan-receive endpoint ----------
  // Accepts every input shape in the wild:
  //  - printed item labels (QR encoding a JSON payload with invoiceNumber +
  //    itemType, and optionally a per-piece itemId)
  //  - legacy "Invoice|ItemType" barcodes
  // A bare invoice number with no item type is no longer sufficient — the
  // server now tracks receiving per item type, so it needs to know WHICH
  // item on the invoice this scan represents.
  const submitScan = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || busyRef.current) return;

      // Parse BEFORE uppercasing — uppercasing a JSON payload mangles its
      // keys ("invoiceNumber" -> "INVOICENUMBER") and breaks parsing.
      const parsed = parseItemLabel(trimmed);

      if (!parsed || !parsed.itemType) {
        setFeedback({
          kind: "error",
          text: `Missing item type. Scan the printed item label, or type "InvoiceNumber|ItemType".`,
        });
        return;
      }

      const invoiceNumber = parsed.invoiceNumber.toUpperCase();
      const itemType = parsed.itemType;

      // Client-side charset check on the invoice number (UX only; server
      // re-validates with Zod)
      if (!/^[A-Za-z0-9-]{3,40}$/.test(invoiceNumber)) {
        setFeedback({
          kind: "error",
          text: `Unrecognized invoice number: "${invoiceNumber.slice(0, 24)}"`,
        });
        return;
      }

      busyRef.current = true;
      setFeedback(null);

      try {
        const res = await fetch(
          `/api/containers/${encodeURIComponent(containerId)}/scan-receive`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invoiceNumber,
              itemType,
              itemId: parsed.itemId,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          if (navigator.vibrate) navigator.vibrate(100); // haptic tick on phones
          setPiecesRemaining(data.containerPiecesRemaining ?? null);

          if (data.invoiceFullyReceived) {
            setInvoices((prev) =>
              prev.map((inv) =>
                inv.invoiceNumber.toUpperCase() === invoiceNumber
                  ? { ...inv, status: "Received At Hub" }
                  : inv,
              ),
            );
            setFeedback({
              kind: "ok",
              text: `✓ ${invoiceNumber} fully received (last piece: ${itemType}).`,
            });
          } else {
            setFeedback({
              kind: "ok",
              text: `✓ ${itemType} logged for ${invoiceNumber} (${data.scannedQuantity}/${data.itemQuantity}). ${data.invoicePiecesRemaining} piece(s) left on this invoice.`,
            });
          }
        } else if (data?.code === "WRONG_CONTAINER") {
          if (navigator.vibrate) navigator.vibrate([80, 60, 80, 60, 80]);
          setFeedback({ kind: "error", text: `⚠️ ${data.error}` });
        } else if (data?.code === "ALREADY_SCANNED") {
          setFeedback({ kind: "warn", text: data.error });
        } else if (data?.code === "ITEM_NOT_ON_INVOICE") {
          if (navigator.vibrate) navigator.vibrate([80, 60, 80, 60, 80]);
          setFeedback({ kind: "error", text: `⚠️ ${data.error}` });
        } else if (data?.code === "SCAN_CONFLICT") {
          setFeedback({ kind: "warn", text: data.error });
        } else {
          setFeedback({
            kind: "error",
            text: data?.error || "Scan failed. Try again.",
          });
        }
      } catch {
        setFeedback({
          kind: "error",
          text: "Network error — scan not recorded. Retry.",
        });
      } finally {
        busyRef.current = false;
      }
    },
    [containerId],
  );

  // ---------- Camera lifecycle ----------
  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setCameraOn(false);
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch {
        /* already stopped */
      }
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);

    // getUserMedia requires a secure context: HTTPS, or localhost.
    // A phone hitting the dev server over LAN IP (http://192.168.x.x) will
    // be blocked by the browser — see note below the scanner box.
    if (!window.isSecureContext) {
      setCameraError(
        "Camera requires HTTPS (or localhost). Open this page over a secure connection.",
      );
      return;
    }

    try {
      const scanner = new Html5Qrcode(SCANNER_DIV_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" }, // back camera
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // Cooldown: the camera decodes the same label repeatedly
          const now = Date.now();
          const last = lastScansRef.current.get(decodedText) || 0;
          if (now - last < DUPLICATE_COOLDOWN_MS) return;
          lastScansRef.current.set(decodedText, now);
          submitScan(decodedText);
        },
        () => {
          /* per-frame decode misses — normal, ignore */
        },
      );
      setCameraOn(true);
    } catch (err) {
      console.error("Camera start failed:", err);
      setCameraError(
        "Could not access the camera. Check browser permission for this site.",
      );
      scannerRef.current = null;
    }
  }, [submitScan]);

  // Stop the camera when leaving the page
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Received = scanned in at the hub (or past it). Pending = everything
  // else still in the container, WHATEVER its exact pre-hub status is —
  // an invoice that missed a cascade must still show up as scannable
  // instead of silently vanishing from both lists.
  const received = invoices.filter((i) =>
    RECEIVED_OR_LATER.includes(norm(i.status)),
  );
  const pending = invoices.filter(
    (i) => !RECEIVED_OR_LATER.includes(norm(i.status)),
  );
  // Prefer the server's piece-level count once we have one (accurate down
  // to the individual item); fall back to invoice-level completeness
  // before the first scan of the session has happened.
  const done =
    invoices.length > 0 &&
    (piecesRemaining !== null
      ? piecesRemaining === 0
      : received.length === invoices.length);

  // Auto-stop the camera once everything is scanned
  useEffect(() => {
    if (done && cameraOn) stopCamera();
  }, [done, cameraOn, stopCamera]);

  // Focus anchor for hardware (keyboard-wedge) scanners: keep the manual
  // input focused whenever the camera isn't in use, so a trigger pull
  // types into the field hands-free. Camera scanning bypasses this.
  useEffect(() => {
    if (!loading && !done && !cameraOn) {
      inputRef.current?.focus();
    }
  }, [loading, done, cameraOn, invoices]);

  if (loading) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", color: "#5f6368" }}>
        Loading container manifest…
      </div>
    );
  }

  if (!isDestAdmin) {
    return (
      <div style={{ padding: "4rem", textAlign: "center", color: "#d93025" }}>
        You do not have access to unstuffing operations.
      </div>
    );
  }

  const feedbackColors: Record<string, { bg: string; fg: string }> = {
    ok: { bg: "#e6f4ea", fg: "#137333" },
    warn: { bg: "#fef7e0", fg: "#7a5d00" },
    error: { bg: "#fce8e6", fg: "#c5221f" },
  };

  return (
    <div style={{ padding: "1.25rem", maxWidth: "760px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.35rem", color: "#202124", margin: 0 }}>
          Unstuffing — {containerId}{" "}
          {containerStatus && (
            <Badge variant={done ? "completed" : "cleared"}>
              {containerStatus}
            </Badge>
          )}
        </h1>
      </div>

      {/* Progress — invoices, and pieces once we have a piece count */}
      <div style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.9rem",
            color: "#3c4043",
            marginBottom: "0.35rem",
          }}
        >
          <strong>
            {received.length} of {invoices.length} invoices
            {piecesRemaining !== null && (
              <span style={{ fontWeight: 400, color: "#5f6368" }}>
                {" "}
                · {piecesRemaining} piece(s) remaining
              </span>
            )}
          </strong>
          {done && <span style={{ color: "#137333" }}>✓ Complete</span>}
        </div>
        <div
          style={{
            height: "8px",
            background: "#e8eaed",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${invoices.length ? (received.length / invoices.length) * 100 : 0}%`,
              background: done ? "#137333" : "#1a73e8",
              transition: "width 0.25s ease",
            }}
          />
        </div>
      </div>

      {/* Camera scanner */}
      {!done && (
        <div style={{ marginBottom: "1rem" }}>
          <div
            id={SCANNER_DIV_ID}
            style={{
              width: "100%",
              borderRadius: "8px",
              overflow: "hidden",
              background: cameraOn ? "#000" : "transparent",
            }}
          />
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            {!cameraOn ? (
              <Button onClick={startCamera}>
                {" "}
                <CameraIcon
                  size={18}
                  style={{ marginRight: "0.25rem", alignContent: "center" }}
                />{" "}
                Start Camera Scanning
              </Button>
            ) : (
              <Button variant="secondary" onClick={stopCamera}>
                Stop Camera
              </Button>
            )}
          </div>
          {cameraError && (
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.6rem 0.75rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                background: "#fce8e6",
                color: "#c5221f",
              }}
            >
              {cameraError}
            </div>
          )}
        </div>
      )}

      {/* Manual entry / hardware scanner input */}
      {!done && (
        <div
          style={{ display: "flex", gap: "0.6rem", marginBottom: "0.75rem" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                submitScan(scanValue);
                setScanValue("");
              }
            }}
            placeholder="Scan an item label, or type Invoice|ItemType…"
            style={{
              flex: 1,
              padding: "0.7rem 0.85rem",
              fontSize: "1rem",
              letterSpacing: "0.05em",
              border: "1.5px solid #dadce0",
              borderRadius: "6px",
              outline: "none",
            }}
          />
          <Button
            onClick={() => {
              submitScan(scanValue);
              setScanValue("");
            }}
            disabled={!scanValue.trim()}
          >
            Receive
          </Button>
        </div>
      )}

      {feedback && (
        <div
          style={{
            padding: "0.7rem 0.85rem",
            borderRadius: "6px",
            fontSize: "0.95rem",
            marginBottom: "1rem",
            backgroundColor: feedbackColors[feedback.kind].bg,
            color: feedbackColors[feedback.kind].fg,
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Pending / received lists */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "0.95rem", color: "#3c4043" }}>
            Pending ({pending.length})
          </h3>
          {pending.map((inv) => (
            <div
              key={inv.id}
              style={{
                padding: "0.6rem 0.75rem",
                border: "1px solid #e8eaed",
                borderRadius: "6px",
                marginBottom: "0.5rem",
                fontSize: "0.9rem",
              }}
            >
              <strong>{inv.invoiceNumber}</strong>
              <div style={{ color: "#5f6368", fontSize: "0.8rem" }}>
                {inv.consigneeName} — {inv.destinationCity}
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <p style={{ color: "#5f6368", fontSize: "0.85rem" }}>
              Nothing pending.
            </p>
          )}
        </div>
        <div>
          <h3 style={{ fontSize: "0.95rem", color: "#3c4043" }}>
            Received ({received.length})
          </h3>
          {received.map((inv) => (
            <div
              key={inv.id}
              style={{
                padding: "0.6rem 0.75rem",
                border: "1px solid #ceead6",
                background: "#f6fbf7",
                borderRadius: "6px",
                marginBottom: "0.5rem",
                fontSize: "0.9rem",
              }}
            >
              <strong>{inv.invoiceNumber}</strong> ✓
              <div style={{ color: "#5f6368", fontSize: "0.8rem" }}>
                {inv.consigneeName} — {inv.destinationCity}
              </div>
            </div>
          ))}
          {received.length === 0 && (
            <p style={{ color: "#5f6368", fontSize: "0.85rem" }}>
              No scans yet.
            </p>
          )}
        </div>
      </div>

      {done && (
        <div style={{ marginTop: "1.5rem" }}>
          <Button
            onClick={() =>
              (window.location.href = `/dashboard/admins/manifests/${encodeURIComponent(containerId)}`)
            }
          >
            Back to Distribution List
          </Button>
        </div>
      )}
    </div>
  );
}
