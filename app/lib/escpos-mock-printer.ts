// lib/escpos-mock-printer.ts
//
// Decodes a raw ESC/POS byte stream — the exact same bytes that
// `buildItemLabelBytes()` in escpos-printer.ts produces — into a structured
// list of render instructions, with NO hardware involved.
//
// Use this to verify label content/layout is correct before ever touching
// a real printer. It understands the specific command subset that
// escpos-printer.ts emits: init, align, bold, double-height, text, the
// GS ( k QR code group, feed, and cut.
//
// This is a dev/test utility only — it is not used in the production print
// path. Pair it with EscPosMockRenderer (escpos-mock-renderer.tsx) to see
// the decoded label as an image, or just inspect the returned instruction
// list directly in a test.

export type DecodedInstruction =
  | { type: "text"; value: string; bold: boolean; doubleHeight: boolean; align: "left" | "center" }
  | { type: "qr"; data: string; moduleSize: number; align: "left" | "center" }
  | { type: "feed"; lines: number }
  | { type: "cut" };

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Parses a raw ESC/POS byte stream into structured instructions.
 * Throws if it encounters a command outside the subset escpos-printer.ts
 * emits — that's intentional: a parse failure here means either the byte
 * builder changed and this decoder needs updating, or the builder produced
 * something malformed.
 */
export function decodeEscPosBytes(bytes: Uint8Array): DecodedInstruction[] {
  const instructions: DecodedInstruction[] = [];
  const decoder = new TextDecoder();

  let align: "left" | "center" = "left";
  let bold = false;
  let doubleHeight = false;
  let textBuffer: number[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) return;
    const value = decoder.decode(new Uint8Array(textBuffer));
    textBuffer = [];
    if (value.length > 0) {
      instructions.push({ type: "text", value, bold, doubleHeight, align });
    }
  };

  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];

    if (byte === ESC) {
      const next = bytes[i + 1];

      if (next === 0x40) {
        // ESC @ — initialize
        flushText();
        align = "left";
        bold = false;
        doubleHeight = false;
        i += 2;
        continue;
      }

      if (next === 0x61) {
        // ESC a n — alignment
        flushText();
        align = bytes[i + 2] === 0x01 ? "center" : "left";
        i += 3;
        continue;
      }

      if (next === 0x45) {
        // ESC E n — bold
        flushText();
        bold = bytes[i + 2] === 0x01;
        i += 3;
        continue;
      }

      if (next === 0x64) {
        // ESC d n — feed n lines
        flushText();
        instructions.push({ type: "feed", lines: bytes[i + 2] });
        i += 3;
        continue;
      }

      throw new Error(
        `Unrecognized ESC command 0x${next?.toString(16)} at byte ${i}`,
      );
    }

    if (byte === GS) {
      const next = bytes[i + 1];

      if (next === 0x21) {
        // GS ! n — character size (we only ever emit 0x00 / 0x11)
        flushText();
        doubleHeight = bytes[i + 2] === 0x11;
        i += 3;
        continue;
      }

      if (next === 0x56) {
        // GS V n — cut
        flushText();
        instructions.push({ type: "cut" });
        i += 3;
        continue;
      }

      if (next === 0x28 && bytes[i + 2] === 0x6b) {
        // GS ( k — function group (QR code commands)
        flushText();
        const pL = bytes[i + 3];
        const pH = bytes[i + 4];
        const groupLen = pL + (pH << 8);
        const cn = bytes[i + 5];
        const fn = bytes[i + 6];
        const dataStart = i + 7;
        const dataLen = groupLen - 2;
        const data = bytes.slice(dataStart, dataStart + dataLen);

        if (cn === 0x31 && fn === 0x50) {
          // Store QR data (fn 0x30 sub-function precedes the payload byte)
          const qrBytes = data.slice(1); // drop the leading 0x30 sub-function byte
          instructions.push({
            type: "qr",
            data: decoder.decode(qrBytes),
            moduleSize: 6, // module size is set in a separate command; default fallback
            align,
          });
        }
        // Other QR sub-commands (select model, module size, error correction,
        // print stored data) carry no renderable content on their own —
        // skip them silently.

        i = dataStart + dataLen;
        continue;
      }

      throw new Error(
        `Unrecognized GS command 0x${next?.toString(16)} at byte ${i}`,
      );
    }

    textBuffer.push(byte);
    i += 1;
  }

  flushText();
  return instructions;
}