// app/lib/print-bus.ts
//
// Cross-tab channel used ONLY for the no-hardware test flow: when
// CollectConfirmModal runs in simulate mode, it broadcasts the exact bytes
// it would have sent to the printer. The print-test page (opened in a new
// tab when the driver clicks Confirm) listens on this same channel and
// renders each label as it arrives, so you can visually confirm the modal
// and the "printer" are in sync.
//
// This has nothing to do with the real print path. Real printing writes
// directly to the Bluetooth GATT characteristic in escpos-printer.ts and
// never touches this channel.

const CHANNEL_NAME = "logitrack-print-bus";
const REPLAY_KEY = "logitrack:print-bus:replay-log";

export interface PrintBusLabel {
  itemType: string;
  sequenceNumber: number;
  totalItems: number;
  invoiceNumber: string;
  bytes: number[]; // Uint8Array isn't structured-clone-friendly across all browsers, so send as a plain array
}

export type PrintBusMessage = { seq: number } & (
  | { type: "job-started"; invoiceNumber: string; shipmentId: string; totalItems: number }
  | { type: "label-printed"; label: PrintBusLabel }
  | { type: "job-finished" }
);

// Plain `Omit<PrintBusMessage, "seq">` doesn't work correctly here: Omit is
// implemented via Pick<T, Exclude<keyof T, K>>, and `keyof` over a union
// only returns the keys common to ALL members — so it silently collapses
// to just `{ seq, type }`, discarding every variant-specific field. This
// distributive version maps over each union member individually instead.
type DistributiveOmitSeq<T> = T extends { seq: number }
  ? Omit<T, "seq">
  : never;
export type PrintBusMessageInput = DistributiveOmitSeq<PrintBusMessage>;

let channel: BroadcastChannel | null = null;
let seqCounter = 0;

function nextSeq(): number {
  seqCounter += 1;
  return seqCounter;
}

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

export function publishPrintBusMessage(message: PrintBusMessageInput): void {
  const withSeq = { ...message, seq: nextSeq() } as PrintBusMessage;

  getChannel()?.postMessage(withSeq);

  // BroadcastChannel only reaches tabs that are already listening. Since
  // window.open() + the new tab's JS bootstrapping isn't instant, also
  // persist a running log to localStorage (which IS visible across tabs
  // immediately) so a late-mounting print-test tab can replay whatever it
  // missed instead of silently starting mid-job. Each message's `seq` lets
  // the reader dedup against anything it also receives live.
  if (typeof window === "undefined") return;
  try {
    if (withSeq.type === "job-started") {
      window.localStorage.setItem(REPLAY_KEY, JSON.stringify([withSeq]));
    } else {
      const raw = window.localStorage.getItem(REPLAY_KEY);
      const existing: PrintBusMessage[] = raw ? JSON.parse(raw) : [];
      existing.push(withSeq);
      window.localStorage.setItem(REPLAY_KEY, JSON.stringify(existing));
    }
  } catch (err) {
    console.error("Failed to persist print bus replay log:", err);
  }
}

/**
 * Reads whatever's been published for the current job so far. Call this
 * once on mount, before subscribing live, so messages sent during page
 * load aren't lost. Returns messages in seq order.
 */
export function readPrintBusReplayLog(): PrintBusMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REPLAY_KEY);
    const messages: PrintBusMessage[] = raw ? JSON.parse(raw) : [];
    return messages.sort((a, b) => a.seq - b.seq);
  } catch (err) {
    console.error("Failed to read print bus replay log:", err);
    return [];
  }
}

/**
 * Combines the replay log with a live subscription, deduping by `seq` so a
 * message present in both (the common race when the tab finishes mounting
 * mid-publish) is only delivered once. This is what print-test/page.tsx
 * should use rather than calling readPrintBusReplayLog/subscribeToPrintBus
 * separately.
 */
export function subscribeToPrintBusWithReplay(
  onMessage: (message: PrintBusMessage) => void,
): () => void {
  const seenSeqs = new Set<number>();

  const deliver = (message: PrintBusMessage) => {
    if (seenSeqs.has(message.seq)) return;
    seenSeqs.add(message.seq);
    onMessage(message);
  };

  readPrintBusReplayLog().forEach(deliver);
  return subscribeToPrintBus(deliver);
}

/**
 * Subscribes to print bus messages. Returns an unsubscribe function.
 * Note: BroadcastChannel delivers to *other* contexts, including other
 * tabs on the same origin — exactly what's needed for the modal (one tab)
 * to drive the print-test viewer (another tab).
 */
export function subscribeToPrintBus(
  onMessage: (message: PrintBusMessage) => void,
): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (event: MessageEvent<PrintBusMessage>) => {
    onMessage(event.data);
  };

  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}