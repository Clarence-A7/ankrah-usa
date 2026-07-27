// app/lib/statuses.ts
export const INVOICE_STATUSES = [
  "Ready For Pickup",   // booked + paid (confirm_payment.php)
  "Pending Pickup",     // pickup scheduled
  "Collected",          // o_driver picked up from customer
  "Received At Origin", // scanned in at USA hub
  "In-Transit",         // container sealed (cascade)
  "Arrived",            // container arrived at Tema (cascade)
  "Cleared",            // seal verified (cascade)
  "Received At Hub",    // scanned out during unstuffing in Ghana
  "Out For Delivery",   // dispatched to d_driver
  "Returned To Hub",    // failed delivery attempt, back at Ghana hub (re-dispatchable)
  "Delivered",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Destination-side groupings — single source of truth for the
// Deliveries page and the dispatch/reassign/return routes.
export const DISPATCHABLE_STATUSES: InvoiceStatus[] = [
  "Received At Hub",
  "Returned To Hub",
];
export const REASSIGNABLE_STATUS: InvoiceStatus = "Out For Delivery";
export const RETURNED_STATUS: InvoiceStatus = "Returned To Hub";
export const DISPATCHED_STATUS: InvoiceStatus = "Out For Delivery";