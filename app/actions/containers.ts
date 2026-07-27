// app/services/containers.ts
import "server-only"; // hard guarantee this never bundles into client code
import { db } from "../lib/db";
import { getSession } from "../lib/session";

const ADMIN_ROLES = ["super_admin", "origin_admin", "destination_admin"] as const;

// Prisma Decimal → safe number (Number(null) is 0, Number(Decimal) works,
// but guard NaN from bad data anyway)
function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Null-safe date → "YYYY-MM-DD" (open containers have no ETA/departure yet)
function toDateString(value: Date | null | undefined): string {
  return value ? value.toISOString().split("T")[0] : "TBD";
}

const usd = (n: number) =>
  `USD ${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export async function getContainersForDashboard() {
  // 1. Authenticate before any DB work
  const session = await getSession();
  if (!session?.userId || !session.role) {
    throw new Error("Unauthorized");
  }

  // 2. Authorize in the handler, not just middleware
  if (!ADMIN_ROLES.includes(session.role as (typeof ADMIN_ROLES)[number])) {
    throw new Error("Forbidden");
  }

  const canSeeFinancials =
    session.role === "super_admin" || session.role === "origin_admin";

  const containers = await db.container.findMany({
    include: {
      invoices: {
        select: {
          // Only the columns we aggregate — not full invoice rows
          amountPaid: true,
          amountDue: true,
          items: {
            select: { quantity: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return containers.map((container) => {
    const totalInvoices = container.invoices.length;

    const totalItems = container.invoices.reduce(
      (sum, inv) =>
        sum + inv.items.reduce((iSum, item) => iSum + item.quantity, 0),
      0,
    );

    // collectedRevenue = Σ amountPaid
    const collected = container.invoices.reduce(
      (sum, inv) => sum + toNumber(inv.amountPaid),
      0,
    );

    // estimated revenue = Σ (amountPaid + amountDue)  ← paid + outstanding
    const estimated = container.invoices.reduce(
      (sum, inv) => sum + toNumber(inv.amountPaid) + toNumber(inv.amountDue),
      0,
    );

    const base = {
      id: container.id,
      size: container.size,
      vessel: container.vessel ?? "TBD",
      eta: toDateString(container.eta),
      depatureDate: toDateString(container.departureDate),
      // NULL status = container still open/loading at origin hub
      status: container.status ?? "Containerized",
      originCity: container.originCity,
      destinationCity: container.destinationCity,
      shippingLine: container.shippingLine ?? "TBD",
      totalInvoices,
      totalItems,
      // Sensitive fields default to empty — populated below per role
      sealNumber: "",
      loadedBy: "",
      revenue: "",
      collectedRevenue: "",
    };

    // 3. Server-side redaction: destination_admin never receives these
    // values in the payload, so nothing leaks via DevTools/RSC payload
    if (!canSeeFinancials) {
      return base;
    }

    return {
      ...base,
      sealNumber: container.sealNumber ?? "",
      loadedBy: container.loadedBy ?? "Unassigned",
      revenue: usd(estimated),
      collectedRevenue: usd(collected),
    };
  });
}