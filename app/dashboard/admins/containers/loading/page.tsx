"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Container,
  QrCode,
  Package,
  ShieldCheck,
} from "lucide-react";
import { Table } from "../../../../components/ui/Table";
import { Modal } from "../../../../components/ui/Alert";
import Button from "../../../../components/ui/Button";
import { parseItemLabel } from "../../../../lib/label-parser";
import styles from "./loading.module.css";

interface ScannedItem {
  itemType: string;
  quantity: number;
}

interface InvoiceGroup {
  invoiceNumber: string;
  items: ScannedItem[];
  loadStatus: "Partial" | "Full";
  totalBooked?: number; // booked piece count from the server (first scan)
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const plusDaysStr = (d: number) =>
  new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const scannedCount = (g: InvoiceGroup) =>
  g.items.reduce((a, i) => a + i.quantity, 0);

export default function ContainerLoadingPage() {
  // Session Intake States
  const [isInitialized, setIsInitialized] = useState(false);
  const [newContainerNum, setNewContainerNum] = useState("");
  const [newSealNum, setNewSealNum] = useState("");
  const [containerSize, setContainerSize] = useState<number>(40);
  const [destinationCity, setDestinationCity] = useState("Accra, GH");
  const [shippingLine, setShippingLine] = useState("");
  const [vesselName, setVesselName] = useState("");
  const [originCity, setOriginCity] = useState("Newark, NJ"); // ← set your real USA hub default
  const [departureDate, setDepartureDate] = useState(todayStr());
  const [eta, setEta] = useState(plusDaysStr(30));

  // Live Ledger State
  const [invoiceGroups, setInvoiceGroups] = useState<InvoiceGroup[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [terminalMessage, setTerminalMessage] = useState("");

  // Modal State Engine Configuration
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    variant: "info" as "info" | "success" | "warning" | "danger",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    onConfirm: undefined as (() => void) | undefined,
    isLoading: false,
  });

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Maintain persistent focus on scanner anchor
  useEffect(() => {
    if (isInitialized && scanInputRef.current && !modalConfig.isOpen) {
      scanInputRef.current.focus();
    }
  }, [isInitialized, invoiceGroups, modalConfig.isOpen]);

  // PHASE 1: Initialize the session directly in the DB
  const handleInitializeTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !newContainerNum.trim() ||
      !newSealNum.trim() ||
      !shippingLine.trim() ||
      !vesselName.trim() ||
      !originCity.trim() ||
      !departureDate ||
      !eta
    )
      return;

    setTerminalMessage("⌛ Creating live container loading session...");

    try {
      const response = await fetch("/api/containers/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerNumber: newContainerNum,
          sealNumber: newSealNum,
          size: containerSize,
          destinationCity,
          shippingLine,
          vessel: vesselName,
          originCity,
          departureDate,
          eta,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to initialize container session.",
        );
      }

      setIsInitialized(true);
      setTerminalMessage(
        "🟢 Live terminal connected. Ready for hardware scanner inputs.",
      );
    } catch (error: any) {
      console.error("Initialization error:", error);
      setTerminalMessage(`❌ Initialization Failed: ${error.message}`);
      setModalConfig({
        isOpen: true,
        title: "Session Initialization Error",
        message:
          error.message || "Could not spin up database log for this container.",
        variant: "danger",
        confirmLabel: "Retry",
        cancelLabel: "Cancel",
        onConfirm: undefined,
        isLoading: false,
      });
    }
  };

  // PHASE 2: Live Streaming Scans to the DB Manifest
  // Accepts BOTH label formats via parseItemLabel:
  //  - JSON QR payloads from the driver print flow
  //  - legacy "Invoice|ItemType" barcodes
  const processScan = async (value: string) => {
    const parsed = parseItemLabel(value);

    if (!parsed) {
      setModalConfig({
        isOpen: true,
        title: "Unrecognized Label",
        message: `The scanned value could not be read. Expected a printed item label (QR) or "InvoiceNumber|ItemType" (e.g., INV-2026-05001|Barrel). If this is a printed label, check the scanner's keyboard-layout setting.`,
        variant: "warning",
        confirmLabel: "Dismiss",
        cancelLabel: "Cancel",
        onConfirm: undefined,
        isLoading: false,
      });
      setTerminalMessage("❌ Unrecognized label format");
      return;
    }

    const { invoiceNumber: scannedInvoice, itemType: scannedItemType } = parsed;

    try {
      const response = await fetch("/api/containers/scan-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerNumber: newContainerNum,
          invoiceNumber: scannedInvoice,
          itemType: scannedItemType,
          // Present only on JSON labels; lets the server dedupe by exact
          // physical piece if/when you want scan-level idempotency.
          itemId: parsed.itemId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to log item scanning.");
      }

      // Update local state display only after successful database acknowledgment
      setInvoiceGroups((prevGroups) => {
        const existingIdx = prevGroups.findIndex(
          (g) => g.invoiceNumber === result.invoiceNumber,
        );

        if (existingIdx === -1) {
          const booked = result.totalBooked ?? undefined;
          return [
            {
              invoiceNumber: result.invoiceNumber,
              items: [{ itemType: scannedItemType, quantity: 1 }],
              totalBooked: booked,
              loadStatus:
                booked !== undefined && 1 >= booked ? "Full" : "Partial",
            },
            ...prevGroups,
          ];
        }

        const updated = [...prevGroups];
        const targetGroup = { ...updated[existingIdx] };
        const items = [...targetGroup.items];
        const existingItemIdx = items.findIndex(
          (i) => i.itemType === scannedItemType,
        );

        if (existingItemIdx > -1) {
          items[existingItemIdx] = {
            ...items[existingItemIdx],
            quantity: items[existingItemIdx].quantity + 1,
          };
        } else {
          items.push({ itemType: scannedItemType, quantity: 1 });
        }

        targetGroup.items = items;
        // Full when every booked piece has been physically scanned
        const scanned = items.reduce((a, i) => a + i.quantity, 0);
        targetGroup.loadStatus =
          targetGroup.totalBooked !== undefined &&
          scanned >= targetGroup.totalBooked
            ? "Full"
            : "Partial";
        updated[existingIdx] = targetGroup;

        return updated;
      });

      setTerminalMessage(
        `✅ Logged ${scannedItemType} to ${result.invoiceNumber}`,
      );
    } catch (error: any) {
      console.error("Scan transmission error:", error);
      setTerminalMessage(`❌ Scan Sync Error: ${error.message}`);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanInput.trim()) {
      processScan(scanInput);
      setScanInput("");
    }
  };

  const resetLocalSession = () => {
    setIsInitialized(false);
    setNewContainerNum("");
    setNewSealNum("");
    setShippingLine("");
    setVesselName("");
    setOriginCity("Newark, NJ");
    setDepartureDate(todayStr());
    setEta(plusDaysStr(30));
    setInvoiceGroups([]);
  };

  const handleResetClick = () => {
    setModalConfig({
      isOpen: true,
      title: "Reset Terminal Workspace?",
      message:
        "Are you sure you want to reset the current session? This will wipe local terminal visibility, but already logged manifest entries remain intact inside the system repository.",
      variant: "danger",
      confirmLabel: "Reset Session",
      cancelLabel: "Keep Data",
      isLoading: false,
      onConfirm: () => {
        resetLocalSession();
        setTerminalMessage("");
        setModalConfig((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // PHASE 3: Seal the container — this is the moment the container becomes
  // In-Transit and every loaded invoice cascades with it.
  const handleCloseContainerSubmit = () => {
    setModalConfig({
      isOpen: true,
      title: "Confirm Final Seal & Submit?",
      message:
        "Verify the physical seal on the container matches the number below, then confirm. This locks the container and sets it In-Transit.",
      variant: "success",
      confirmLabel: "Verify & Seal Container",
      cancelLabel: "Return to Ledger",
      isLoading: false,
      onConfirm: async () => {
        setModalConfig((prev) => ({ ...prev, isLoading: true }));

        try {
          const response = await fetch("/api/containers/seal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              containerNumber: newContainerNum,
              sealNumber: newSealNum, // server verifies this matches the stored seal
              vessel: vesselName,
              shippingLine,
            }),
          });

          const result = await response.json();

          if (!response.ok) {
            throw new Error(
              result.error || "Failed to finalize and seal container entry.",
            );
          }

          resetLocalSession();
          setTerminalMessage(
            `🎉 Container sealed — ${result.cascaded} invoice(s) now In-Transit.`,
          );
        } catch (error: any) {
          console.error("Transmission error:", error);
          setTerminalMessage(
            `❌ Error: ${error.message || "Failed to sync transaction."}`,
          );
        } finally {
          setModalConfig((prev) => ({
            ...prev,
            isOpen: false,
            isLoading: false,
          }));
        }
      },
    });
  };

  // Dock-focused ledger: the loader needs "did my scan register?" and
  // "is this invoice fully loaded?" — nothing else. Consigner/consignee/
  // amounts live on the manifest page where they're actually needed.
  const tableColumns = [
    {
      header: "Invoice",
      render: (item: InvoiceGroup) => (
        <span className={styles.invoiceTag}>{item.invoiceNumber}</span>
      ),
    },
    {
      header: "Items Scanned",
      render: (item: InvoiceGroup) => (
        <div className={styles.flexBlockColumn}>
          {item.items.map((sub, idx) => (
            <div key={idx} className={styles.nestedItemRow}>
              {sub.quantity} × {sub.itemType}
            </div>
          ))}
        </div>
      ),
    },
    {
      header: "Progress",
      render: (item: InvoiceGroup) => (
        <span className={styles.textBold}>
          {scannedCount(item)}
          {item.totalBooked !== undefined ? ` / ${item.totalBooked}` : ""} pcs
        </span>
      ),
    },
    {
      header: "Loaded",
      render: (item: InvoiceGroup) => (
        <span
          className={
            item.loadStatus === "Full" ? styles.badgeFull : styles.badgePartial
          }
        >
          {item.loadStatus}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.terminalContainer}>
      <div className={styles.terminalInner}>
        <header className={styles.terminalHeader}>
          <Button
            variant="primary"
            className={styles.backBtn}
            onClick={handleResetClick}
          >
            <ArrowLeft size={18} /> Reset Terminal
          </Button>

          {isInitialized && (
            <div className={styles.metaBadges}>
              <div>
                <span>Container:</span>{" "}
                <strong className={styles.blueMono}>{newContainerNum}</strong>
              </div>
              <div>
                <span>Seal:</span>{" "}
                <strong className={styles.emeraldMono}>{newSealNum}</strong>
              </div>
              <div>
                <span>Route:</span>{" "}
                <strong className={styles.textBold}>
                  {originCity} → {destinationCity}
                </strong>
              </div>
            </div>
          )}
        </header>

        {!isInitialized ? (
          <div className={styles.setupCard}>
            <h2 className={styles.setupTitle}>
              <Container size={20} /> New Consolidation Session
            </h2>
            <form
              onSubmit={handleInitializeTerminal}
              className={styles.setupForm}
            >
              <div className={styles.formGroup}>
                <label>Container Number</label>
                <input
                  type="text"
                  placeholder="e.g. CLHU897654"
                  value={newContainerNum}
                  onChange={(e) =>
                    setNewContainerNum(e.target.value.toUpperCase())
                  }
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Seal Number</label>
                <input
                  type="text"
                  placeholder="e.g. EMC-E391024"
                  value={newSealNum}
                  onChange={(e) => setNewSealNum(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Container Size</label>
                <div className={styles.radioControlWrapper}>
                  <label className={styles.radioLabelOption}>
                    <input
                      type="radio"
                      name="size"
                      checked={containerSize === 20}
                      onChange={() => setContainerSize(20)}
                      className={styles.radioNativeInput}
                    />
                    <span className={styles.radioCustomLabel}>
                      20 ft Standard
                    </span>
                  </label>
                  <label className={styles.radioLabelOption}>
                    <input
                      type="radio"
                      name="size"
                      checked={containerSize === 40}
                      onChange={() => setContainerSize(40)}
                      className={styles.radioNativeInput}
                    />
                    <span className={styles.radioCustomLabel}>
                      40 ft High Cube
                    </span>
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Origin City (USA Hub)</label>
                <input
                  type="text"
                  placeholder="e.g. Newark, NJ"
                  value={originCity}
                  onChange={(e) => setOriginCity(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Destination Port City</label>
                <select
                  value={destinationCity}
                  onChange={(e) => setDestinationCity(e.target.value)}
                  className={styles.dropdownSelectorField}
                >
                  <option value="Accra, GH">Accra, GH (HQ Hub)</option>
                  <option value="Tema, GH">Tema, GH (Port Terminal)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Departure Date</label>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>ETA (Estimated Arrival at Port)</label>
                <input
                  type="date"
                  value={eta}
                  min={departureDate}
                  onChange={(e) => setEta(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Shipping Line (Carrier Slot)</label>
                <input
                  type="text"
                  placeholder="e.g. Evergreen Marine"
                  value={shippingLine}
                  onChange={(e) => setShippingLine(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Vessel Name / Voyage Code</label>
                <input
                  type="text"
                  placeholder="e.g. Evergreen Apex"
                  value={vesselName}
                  onChange={(e) => setVesselName(e.target.value)}
                  required
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className={styles.primaryActionBtn}
              >
                Open Live Terminal
              </Button>
            </form>
          </div>
        ) : (
          <div className={styles.liveTerminalWorkspace}>
            <div className={styles.scanDock}>
              <form onSubmit={handleManualSubmit} className={styles.scanForm}>
                <label>
                  <QrCode size={16} /> Laser Barcode Input Field
                </label>
                <input
                  ref={scanInputRef}
                  type="text"
                  placeholder="Scan a printed item label, or type Invoice|ItemType"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                />
              </form>
              <div className={styles.statusDisplay}>
                <p
                  className={
                    terminalMessage.includes("❌")
                      ? styles.errText
                      : styles.okText
                  }
                >
                  {terminalMessage || "Awaiting hardware gun input trigger..."}
                </p>
              </div>
            </div>

            <div className={styles.ledgerWrapper}>
              <Table columns={tableColumns} data={invoiceGroups} />

              {invoiceGroups.length === 0 && (
                <div className={styles.emptyTableState}>
                  <Package size={36} />
                  <p>Awaiting Session Initial Scan Cargo Payload</p>
                  <span>
                    The cross-dock manifest list is active. Fire your laser
                    scanning gun to populate rows.
                  </span>
                </div>
              )}
            </div>

            {invoiceGroups.length > 0 && (
              <div className={styles.actionFooterRow}>
                <Button
                  type="button"
                  variant="success"
                  onClick={handleCloseContainerSubmit}
                  className={styles.finalSubmitButtonStyles}
                >
                  <ShieldCheck size={20} /> Close & Seal Container
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        variant={modalConfig.variant}
        confirmLabel={modalConfig.confirmLabel}
        cancelLabel={modalConfig.cancelLabel}
        isLoading={modalConfig.isLoading}
        onClose={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={modalConfig.onConfirm}
      >
        {modalConfig.variant === "success" ? (
          <div className={styles.verificationOverlay}>
            <p className={styles.verificationDescription}>
              {modalConfig.message}
            </p>
            {/* Identity fields are read-only at seal time — the container
                number and seal were locked in at initialization. */}
            <div className={styles.verificationGrid}>
              <div className={styles.verificationGroup}>
                <label className={styles.verificationLabel}>
                  Container Number
                </label>
                <input
                  type="text"
                  value={newContainerNum}
                  readOnly
                  className={`${styles.verificationInput} ${styles.inputContainerHighlight}`}
                />
              </div>
              <div className={styles.verificationGroup}>
                <label className={styles.verificationLabel}>Seal Number</label>
                <input
                  type="text"
                  value={newSealNum}
                  readOnly
                  className={`${styles.verificationInput} ${styles.inputSealHighlight}`}
                />
              </div>
              <div className={styles.verificationGroup}>
                <label className={styles.verificationLabel}>Vessel Name</label>
                <input
                  type="text"
                  value={vesselName}
                  onChange={(e) => setVesselName(e.target.value)}
                  className={styles.verificationInput}
                />
              </div>
              <div className={styles.verificationGroup}>
                <label className={styles.verificationLabel}>
                  Shipping Line
                </label>
                <input
                  type="text"
                  value={shippingLine}
                  onChange={(e) => setShippingLine(e.target.value)}
                  className={styles.verificationInput}
                />
              </div>
            </div>
          </div>
        ) : (
          <p>{modalConfig.message}</p>
        )}
      </Modal>
    </div>
  );
}
