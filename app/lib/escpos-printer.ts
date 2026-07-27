// lib/escpos-printer.ts
//
// Minimal ESC/POS driver for handheld Bluetooth label/receipt printers,
// using the Web Bluetooth API (chrome://flags not required on Android Chrome;
// desktop Chrome/Edge also support it over BLE).
//
// This targets the common "Bluetooth Serial Port Profile over GATT" pattern
// used by generic ESC/POS thermal printers (the same protocol family as
// Zebra's mobile ESC/POS-emulation printers, Munbyn, Goojprt, etc).
//
// If your printer ships its own native SDK (Zebra Link-OS, Brother, etc),
// swap the `writeToPrinter` transport below for that SDK's write call —
// everything above it (label composition) stays the same.

import { publishPrintBusMessage } from "./print-bus";

// Common BLE printer service/characteristic UUIDs. Most generic ESC/POS
// BLE printers expose a single "transparent serial" characteristic under
// one of these. If your specific printer model uses different UUIDs,
// update PRINTER_SERVICE_UUID / PRINTER_CHARACTERISTIC_UUID accordingly —
// check the printer's documentation or pair once and log
// `device.gatt.getPrimaryServices()` to discover the real UUIDs.
const PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";

// Most BLE GATT writes are capped around 100-512 bytes depending on MTU.
// Chunking avoids silently dropped writes on printers with small buffers.
const BLE_WRITE_CHUNK_SIZE = 100;

export interface PrintableItemLabel {
  itemType: string;
  sequenceNumber: number; // this item's position in the manifest (1-based)
  totalItems: number; // total number of items in the manifest
  invoiceNumber: string;
  qrPayload: Record<string, unknown>; // encoded as JSON inside the QR code
}

let cachedDevice: BluetoothDevice | null = null;
let cachedCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Prompts the OS Bluetooth picker (if not already connected) and returns a
 * ready-to-write GATT characteristic. Caches the connection for subsequent
 * print calls in the same session so the driver isn't re-prompted per label.
 */
async function getPrinterCharacteristic(): Promise<BluetoothRemoteGATTCharacteristic> {
  if (cachedCharacteristic && cachedDevice?.gatt?.connected) {
    return cachedCharacteristic;
  }

  if (!isWebBluetoothSupported()) {
    throw new Error(
      "Web Bluetooth isn't supported in this browser. Use Chrome on Android, or a Chromium-based desktop browser.",
    );
  }

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [PRINTER_SERVICE_UUID] }],
    optionalServices: [PRINTER_SERVICE_UUID],
  });

  const server = await device.gatt?.connect();
  if (!server) {
    throw new Error("Could not open a GATT connection to the printer.");
  }

  const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
  const characteristic = await service.getCharacteristic(
    PRINTER_CHARACTERISTIC_UUID,
  );

  cachedDevice = device;
  cachedCharacteristic = characteristic;

  device.addEventListener("gattserverdisconnected", () => {
    cachedDevice = null;
    cachedCharacteristic = null;
  });

  return characteristic;
}

async function writeToPrinter(bytes: Uint8Array): Promise<void> {
  const characteristic = await getPrinterCharacteristic();

  for (let offset = 0; offset < bytes.length; offset += BLE_WRITE_CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + BLE_WRITE_CHUNK_SIZE);
    // writeValueWithoutResponse is faster and matches what most BLE thermal
    // printers expect; fall back to writeValue if unsupported.
    if (characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
  }
}

// ---- ESC/POS command builders ----

const ESC = 0x1b;
const GS = 0x1d;

function textToBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function buildInitCommand(): number[] {
  return [ESC, 0x40]; // ESC @ — initialize printer
}

function buildAlignCenterCommand(): number[] {
  return [ESC, 0x61, 0x01]; // ESC a 1 — center alignment
}

function buildAlignLeftCommand(): number[] {
  return [ESC, 0x61, 0x00]; // ESC a 0 — left alignment
}

function buildBoldOnCommand(): number[] {
  return [ESC, 0x45, 0x01]; // ESC E 1
}

function buildBoldOffCommand(): number[] {
  return [ESC, 0x45, 0x00]; // ESC E 0
}

function buildDoubleHeightCommand(on: boolean): number[] {
  return [GS, 0x21, on ? 0x11 : 0x00]; // GS ! — character size (double width+height)
}

function buildFeedCommand(lines: number): number[] {
  return [ESC, 0x64, lines]; // ESC d n — feed n lines
}

function buildCutCommand(): number[] {
  return [GS, 0x56, 0x00]; // GS V 0 — full cut (no-op on printers without a cutter)
}

/**
 * Builds the native ESC/POS "print QR code" command sequence (model 2).
 * This renders the QR code on-device — no image rasterization needed.
 */
function buildQrCodeCommand(data: string, moduleSize = 6): number[] {
  const bytes = textToBytes(data);
  const storeLength = bytes.length + 3;
  const pL = storeLength & 0xff;
  const pH = (storeLength >> 8) & 0xff;

  return [
    // Select QR Code model 2
    GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
    // Set module size
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize,
    // Set error correction level (48 = L)
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
    // Store QR data
    GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...bytes,
    // Print stored QR data
    GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
  ];
}

/**
 * Composes the full label byte sequence for a single manifest item:
 * a centered QR code encoding the JSON payload, followed by human-readable
 * text showing the item type and its position in the manifest (e.g. "Item 2 / 4").
 */
export function buildItemLabelBytes(label: PrintableItemLabel): Uint8Array {
  const qrData = JSON.stringify(label.qrPayload);

  const sequenceText = `Item ${label.sequenceNumber} / ${label.totalItems}`;

  const commands: number[] = [
    ...buildInitCommand(),
    ...buildAlignCenterCommand(),
    ...buildQrCodeCommand(qrData),
    ...buildFeedCommand(1),
    ...buildBoldOnCommand(),
    ...buildDoubleHeightCommand(true),
    ...textToBytes(label.itemType + "\n"),
    ...buildDoubleHeightCommand(false),
    ...textToBytes(sequenceText + "\n"),
    ...buildBoldOffCommand(),
    ...buildAlignLeftCommand(),
    ...textToBytes(`Invoice: ${label.invoiceNumber}\n`),
    ...buildFeedCommand(2),
    ...buildCutCommand(),
  ];

  return new Uint8Array(commands);
}

/**
 * Prints one label per item, sequentially. Each item gets its own physical
 * label (cut/torn separately) rather than one combined sheet.
 *
 * Pass `{ simulate: true }` to skip the real Bluetooth write entirely — used
 * for testing the confirm/print/status-update flow without hardware. In
 * simulate mode, buildItemLabelBytes() still produces the exact same bytes
 * a real print would; only the transport (writeToPrinter) is skipped, and
 * each label is published on the print bus so a print-test tab can render
 * it live as proof the modal and "printer" are in sync.
 */
export async function printItemLabels(
  labels: PrintableItemLabel[],
  onProgress?: (printedCount: number, total: number) => void,
  options?: { simulate?: boolean; invoiceNumber?: string; shipmentId?: string },
): Promise<Uint8Array[]> {
  const printedBytes: Uint8Array[] = [];

  if (options?.simulate) {
    publishPrintBusMessage({
      type: "job-started",
      invoiceNumber: options.invoiceNumber ?? "",
      shipmentId: options.shipmentId ?? "",
      totalItems: labels.length,
    });
  }

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const bytes = buildItemLabelBytes(label);

    if (options?.simulate) {
      // Mimic real BLE write latency so progress UI behaves the same way
      // it would against actual hardware.
      await new Promise((resolve) => setTimeout(resolve, 300));
      publishPrintBusMessage({
        type: "label-printed",
        label: {
          itemType: label.itemType,
          sequenceNumber: label.sequenceNumber,
          totalItems: label.totalItems,
          invoiceNumber: label.invoiceNumber,
          bytes: Array.from(bytes),
        },
      });
    } else {
      await writeToPrinter(bytes);
    }

    printedBytes.push(bytes);
    onProgress?.(i + 1, labels.length);
  }

  if (options?.simulate) {
    publishPrintBusMessage({ type: "job-finished" });
  }

  return printedBytes;
}

export type PrintMode = "real" | "simulated";

/**
 * Tries to print for real first; if no printer is available (unsupported
 * browser, no device paired, picker cancelled, connection failed), falls
 * back to simulate mode automatically — this is the function the modal
 * should call, since it works the same way whether or not a printer is
 * physically present, with no manual toggle to remember.
 *
 * Important safety property: fallback ONLY happens if the failure occurs
 * before any real label has been written (i.e. while still trying to
 * acquire the printer connection for label 1). If real printing fails
 * partway through a batch — meaning some physical labels already came out
 * — this does NOT silently restart in simulate mode, since that could
 * produce a duplicate physical label alongside a simulated one. In that
 * case the original error is rethrown so the caller can show a real error
 * instead of quietly faking the rest of the job.
 */
export async function printItemLabelsAutoFallback(
  labels: PrintableItemLabel[],
  onProgress?: (printedCount: number, total: number) => void,
  meta?: { invoiceNumber?: string; shipmentId?: string },
): Promise<{ mode: PrintMode; bytes: Uint8Array[] }> {
  if (!isWebBluetoothSupported()) {
    const bytes = await printItemLabels(labels, onProgress, {
      simulate: true,
      ...meta,
    });
    return { mode: "simulated", bytes };
  }

  let firstLabelWritten = false;

  try {
    const bytes = await printItemLabels(
      labels,
      (printedCount, total) => {
        if (printedCount >= 1) firstLabelWritten = true;
        onProgress?.(printedCount, total);
      },
      { simulate: false, ...meta },
    );
    return { mode: "real", bytes };
  } catch (err) {
    if (firstLabelWritten) {
      // A real label already printed before this failure — do not silently
      // restart in simulate mode, since that risks a duplicate physical
      // label. Surface the real error instead.
      throw err;
    }

    console.warn(
      "Real printing unavailable, falling back to simulate mode:",
      err,
    );
    const bytes = await printItemLabels(labels, onProgress, {
      simulate: true,
      ...meta,
    });
    return { mode: "simulated", bytes };
  }
}

export function disconnectPrinter(): void {
  if (cachedDevice?.gatt?.connected) {
    cachedDevice.gatt.disconnect();
  }
  cachedDevice = null;
  cachedCharacteristic = null;
}