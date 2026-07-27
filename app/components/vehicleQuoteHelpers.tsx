// Shared between VehicleQuotesTableClient (its own Status/Title columns)
// and VehicleQuoteDetailsModal (its header badge and detail rows) --
// centralized here specifically so both always render status badges and
// title-status labels identically. Duplicating this across both files was
// exactly the kind of drift that caused the "Received At Origin" casing
// bug earlier -- one shared source avoids repeating that.

// Every key here is lowercase, including pipeline statuses like "Received
// At Origin" -> "received at origin" -- getStatusBadge() lowercases
// whatever status string it's given before looking it up, so the map key
// has to be lowercase too or the lookup silently misses.
export const STATUS_BADGE_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  new: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  contacted: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  quoted: { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" },
  booked: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  declined: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
  "received at origin": { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  "in-transit": { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  arrived: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  cleared: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  "received at hub": { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  "out for delivery": { bg: "#faf5ff", text: "#7e22ce", border: "#e9d5ff" },
  delivered: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
};

export const TITLE_STATUS_LABELS: Record<string, string> = {
  clear: "Clear title",
  lien: "Lien on title",
  unsure: "Unsure / needs help",
};

export function getStatusBadge(status: string) {
  const normalizedKey = status.toLowerCase();
  const colors = STATUS_BADGE_COLORS[normalizedKey] || {
    bg: "#f3f4f6",
    text: "#374151",
    border: "#e5e7eb",
  };
  return (
    <span
      className="px-2.5 py-0.5 text-xs font-semibold rounded-full border"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

export function formatMoney(amount: number) {
  return `$${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
