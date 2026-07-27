// app/lib/label-parser.ts
//
// Parses a scanned item label. Accepts both payload formats in the wild:
//  1. JSON from the driver print flow:
//     {"itemId":"...","invoiceNumber":"...","itemType":"...","quantity":1}
//  2. Legacy pipe format: "INV-2026-05001|Barrel"
//
// Used by every scan surface (container loading terminal, unstuffing
// scan-receive, phone camera scanner) so all of them stay format-agnostic.

export interface ParsedItemLabel {
  invoiceNumber: string;
  itemType: string;
  itemId?: string;
  quantity?: number;
}

export function parseItemLabel(raw: string): ParsedItemLabel | null {
  const value = raw.trim();
  if (!value) return null;

  // JSON payload (driver-printed labels)
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (
        typeof parsed.invoiceNumber === "string" &&
        typeof parsed.itemType === "string"
      ) {
        return {
          invoiceNumber: parsed.invoiceNumber.trim(),
          itemType: parsed.itemType.trim(),
          itemId: typeof parsed.itemId === "string" ? parsed.itemId : undefined,
          quantity:
            typeof parsed.quantity === "number" ? parsed.quantity : undefined,
        };
      }
      return null;
    } catch {
      return null; // malformed JSON — likely a partial/truncated scan
    }
  }

  // Pipe format — split on the FIRST pipe only, so item types
  // containing "|" can't break parsing
  const sepIdx = value.indexOf("|");
  if (sepIdx === -1) return null;

  const invoiceNumber = value.slice(0, sepIdx).trim();
  const itemType = value.slice(sepIdx + 1).trim();
  if (!invoiceNumber || !itemType) return null;

  return { invoiceNumber, itemType };
}