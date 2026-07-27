import "server-only";
import { db } from "@/app/lib/db";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/app/lib/statuses";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

function dayKey(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------- Trend helpers ------------------------------- */

export interface DailyPoint {
  day: string;
  value: number;
}

export interface Trend {
  series: DailyPoint[];
  weekOverWeekPct: number | null;
}

function fillSeries(
  rows: { day: Date | string; total: unknown }[],
  since: Date,
  days: number
): DailyPoint[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(dayKey(new Date(r.day)), toNumber(r.total));
  }
  const points: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    points.push({ day: key, value: totals.get(key) ?? 0 });
  }
  return points;
}

function deltaPct(thisPeriod: unknown, lastPeriod: unknown): number | null {
  const cur = toNumber(thisPeriod);
  const prev = toNumber(lastPeriod);
  if (prev === 0) return cur > 0 ? 100 : null;
  return ((cur - prev) / prev) * 100;
}

async function revenueTrend(): Promise<Trend> {
  const twoWeeksAgo = daysAgo(14);
  const oneWeekAgo = daysAgo(7);

  const [seriesRows, deltaRows] = await Promise.all([
    db.$queryRaw<{ day: Date; total: unknown }[]>`
      SELECT DATE(createdAt) AS day, COALESCE(SUM(amountPaid), 0) AS total
      FROM invoices
      WHERE createdAt >= ${twoWeeksAgo}
      GROUP BY DATE(createdAt)
      ORDER BY day ASC
    `,
    db.$queryRaw<{ thisWeek: unknown; lastWeek: unknown }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN createdAt >= ${oneWeekAgo} THEN amountPaid ELSE 0 END), 0) AS thisWeek,
        COALESCE(SUM(CASE WHEN createdAt >= ${twoWeeksAgo} AND createdAt < ${oneWeekAgo} THEN amountPaid ELSE 0 END), 0) AS lastWeek
      FROM invoices
      WHERE createdAt >= ${twoWeeksAgo}
    `,
  ]);

  return {
    series: fillSeries(seriesRows, twoWeeksAgo, 14),
    weekOverWeekPct: deltaRows[0]
      ? deltaPct(deltaRows[0].thisWeek, deltaRows[0].lastWeek)
      : null,
  };
}

async function statusTransitionTrend(status: string): Promise<Trend> {
  const twoWeeksAgo = daysAgo(14);
  const oneWeekAgo = daysAgo(7);

  const [seriesRows, deltaRows] = await Promise.all([
    db.$queryRaw<{ day: Date; total: unknown }[]>`
      SELECT DATE(createdAt) AS day, COUNT(*) AS total
      FROM statushistory
      WHERE status = ${status} AND createdAt >= ${twoWeeksAgo}
      GROUP BY DATE(createdAt)
      ORDER BY day ASC
    `,
    db.$queryRaw<{ thisWeek: unknown; lastWeek: unknown }[]>`
      SELECT
        SUM(CASE WHEN createdAt >= ${oneWeekAgo} THEN 1 ELSE 0 END) AS thisWeek,
        SUM(CASE WHEN createdAt >= ${twoWeeksAgo} AND createdAt < ${oneWeekAgo} THEN 1 ELSE 0 END) AS lastWeek
      FROM statushistory
      WHERE status = ${status} AND createdAt >= ${twoWeeksAgo}
    `,
  ]);

  return {
    series: fillSeries(seriesRows, twoWeeksAgo, 14),
    weekOverWeekPct: deltaRows[0]
      ? deltaPct(deltaRows[0].thisWeek, deltaRows[0].lastWeek)
      : null,
  };
}

async function countStatusTransitionsSince(status: string, since: Date): Promise<number> {
  const rows = await db.$queryRaw<{ total: unknown }[]>`
    SELECT COUNT(*) AS total
    FROM statushistory
    WHERE status = ${status} AND createdAt >= ${since}
  `;
  return toNumber(rows[0]?.total);
}

/* ------------------------------- Vehicle metrics ------------------------------ */

export interface VehicleMetrics {
  pendingRequests: number; // status = new (not yet reviewed/contacted)
  quotesSent: number; // status = quoted, awaiting customer payment
  bookedThisMonth: number; // status = booked, updatedAt within current month
  revenueThisMonth: number; // sum of quotedAmount for the above
}

/**
 * Vehicle shipping metrics are sourced entirely from VehicleQuoteRequest
 * rather than by inferring "is this invoice a vehicle" from ManifestItem —
 * that inference isn't reliable from this layer, and this table is the
 * authoritative record of the quote -> booked lifecycle.
 *
 * Only counts and a sum leave this function — requesterName, email, phone,
 * VIN, and vehicleImageUrl are never touched here.
 */
async function getVehicleMetrics(): Promise<VehicleMetrics> {
  const monthStart = startOfMonth();

  const [statusGroups, bookedThisMonthAgg] = await Promise.all([
    db.vehicleQuoteRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.vehicleQuoteRequest.aggregate({
      _count: { _all: true },
      _sum: { quotedAmount: true },
      where: {
        status: "booked",
        updatedAt: { gte: monthStart },
      },
    }),
  ]);

  const countByStatus = new Map<string, number>(
    statusGroups.map((g) => [g.status, g._count._all])
  );

  return {
    pendingRequests: countByStatus.get("new") ?? 0,
    quotesSent: countByStatus.get("quoted") ?? 0,
    bookedThisMonth: bookedThisMonthAgg._count._all,
    revenueThisMonth: toNumber(bookedThisMonthAgg._sum.quotedAmount),
  };
}

/* ---------------------------------- Types ------------------------------------ */

export interface StatusFunnelEntry {
  status: InvoiceStatus;
  count: number;
}

export interface SuperAdminMetrics {
  scope: "super_admin";
  revenue: {
    collectedThisMonth: number;
    outstanding: number;
    trend: Trend;
  };
  statusFunnel: StatusFunnelEntry[];
  containers: {
    inTransit: number;
    arrived: number;
    cleared: number;
    receivedAtHub: number;
    tamperFlagged: number;
  };
  deliveries: {
    deliveredToday: number;
    outForDelivery: number;
    returnedToHub: number;
    trend: Trend;
  };
  vehicles: VehicleMetrics;
  topDestinations: { city: string; count: number }[];
  recentActivity: {
    invoiceNumber: string;
    status: string;
    changedAt: string;
  }[];
}

export interface OriginAdminMetrics {
  scope: "origin_admin";
  pickups: {
    pendingPickup: number;
    collectedToday: number;
    receivedAtOrigin: number;
    trend: Trend;
  };
  containers: {
    loading: number;
    createdToday: number;
  };
  activeDrivers: number;
  recentPickups: {
    invoiceNumber: string;
    status: string;
    pickupDriver: string | null;
    updatedAt: string;
  }[];
}

export interface DestinationAdminMetrics {
  scope: "destination_admin";
  containers: {
    arrived: number;
    cleared: number;
    receivedAtHub: number;
  };
  deliveries: {
    deliveredToday: number;
    outForDelivery: number;
    returnedToHub: number;
    trend: Trend;
  };
  activeDrivers: number;
  recentDeliveries: {
    invoiceNumber: string;
    status: string;
    deliveryDriver: string | null;
    updatedAt: string;
  }[];
}

/* ------------------------------- Query functions ------------------------------ */

export async function getSuperAdminMetrics(): Promise<SuperAdminMetrics> {
  const monthStart = startOfMonth();
  const todayStart = startOfToday();

  const [
    monthRevenue,
    totalsForOutstanding,
    statusGroups,
    containerGroups,
    tamperFlaggedCount,
    deliveredToday,
    outForDelivery,
    returnedToHub,
    destinationGroups,
    recentHistory,
    revTrend,
    delTrend,
    vehicles,
  ] = await Promise.all([
    db.invoice.aggregate({
      _sum: { amountPaid: true },
      where: { createdAt: { gte: monthStart } },
    }),
    db.invoice.aggregate({
      _sum: { amountDue: true, amountPaid: true },
    }),
    db.invoice.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.container.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.container.count({ where: { tamperFlagged: true } }),
    countStatusTransitionsSince("Delivered", todayStart),
    db.invoice.count({ where: { status: "Out For Delivery" } }),
    db.invoice.count({ where: { status: "Returned To Hub" } }),
    db.invoice.groupBy({
      by: ["destinationCity"],
      _count: { _all: true },
      orderBy: { _count: { destinationCity: "desc" } },
      take: 5,
    }),
    db.statusHistory.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { invoice: { select: { invoiceNumber: true } } },
    }),
    revenueTrend(),
    statusTransitionTrend("Delivered"),
    getVehicleMetrics(),
  ]);

  const countByStatus = new Map<string, number>(
    statusGroups.map((g) => [g.status, g._count._all])
  );
  const statusFunnel: StatusFunnelEntry[] = INVOICE_STATUSES.map((status) => ({
    status,
    count: countByStatus.get(status) ?? 0,
  }));

  const countByContainerStatus = new Map<string, number>(
    containerGroups.map((g) => [g.status ?? "UNSET", g._count._all])
  );

  const dueSum = toNumber(totalsForOutstanding._sum.amountDue);
  const paidSum = toNumber(totalsForOutstanding._sum.amountPaid);

  return {
    scope: "super_admin",
    revenue: {
      collectedThisMonth: toNumber(monthRevenue._sum.amountPaid),
      outstanding: Math.max(dueSum - paidSum, 0),
      trend: revTrend,
    },
    statusFunnel,
    containers: {
      inTransit: countByContainerStatus.get("In_Transit") ?? 0,
      arrived: countByContainerStatus.get("Arrived") ?? 0,
      cleared: countByContainerStatus.get("Cleared") ?? 0,
      receivedAtHub: countByContainerStatus.get("Received_At_Hub") ?? 0,
      tamperFlagged: tamperFlaggedCount,
    },
    deliveries: {
      deliveredToday,
      outForDelivery,
      returnedToHub,
      trend: delTrend,
    },
    vehicles,
    topDestinations: destinationGroups.map((g) => ({
      city: g.destinationCity,
      count: g._count._all,
    })),
    recentActivity: recentHistory.map((h) => ({
      invoiceNumber: h.invoice.invoiceNumber,
      status: h.status,
      changedAt: h.createdAt.toISOString(),
    })),
  };
}

export async function getOriginAdminMetrics(): Promise<OriginAdminMetrics> {
  const todayStart = startOfToday();

  const [
    pendingPickup,
    collectedToday,
    receivedAtOrigin,
    loadingContainers,
    createdToday,
    activeDriverRows,
    recentPickups,
    pickupsTrend,
  ] = await Promise.all([
    db.invoice.count({ where: { status: "Pending Pickup" } }),
    countStatusTransitionsSince("Collected", todayStart),
    db.invoice.count({ where: { status: "Received At Origin" } }),
    db.container.count({ where: { status: "In_Transit" } }),
    db.container.count({ where: { createdAt: { gte: todayStart } } }),
    db.invoice.findMany({
      where: {
        status: { in: ["Collected", "Received At Origin"] },
        updatedAt: { gte: todayStart },
        pickupDriver: { not: null },
      },
      select: { pickupDriver: true },
      distinct: ["pickupDriver"],
    }),
    db.invoice.findMany({
      where: {
        status: { in: ["Pending Pickup", "Collected", "Received At Origin"] },
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: {
        invoiceNumber: true,
        status: true,
        pickupDriver: true,
        updatedAt: true,
      },
    }),
    statusTransitionTrend("Collected"),
  ]);

  return {
    scope: "origin_admin",
    pickups: { pendingPickup, collectedToday, receivedAtOrigin, trend: pickupsTrend },
    containers: { loading: loadingContainers, createdToday },
    activeDrivers: activeDriverRows.length,
    recentPickups: recentPickups.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      status: r.status,
      pickupDriver: r.pickupDriver,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

/**
 * destination_admin mirrors origin_admin's shape but for the delivery
 * side of the pipeline: containers that have landed and cleared, and
 * deliveries out of the destination hub. "Active drivers today" reads
 * `deliveryDriver` (d_driver) rather than `pickupDriver` (o_driver) —
 * these are two distinct driver pools per your role model, never merged.
 */
export async function getDestinationAdminMetrics(): Promise<DestinationAdminMetrics> {
  const todayStart = startOfToday();

  const [
    containerGroups,
    deliveredToday,
    outForDelivery,
    returnedToHub,
    activeDriverRows,
    recentDeliveries,
    deliveredTrend,
  ] = await Promise.all([
    db.container.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    countStatusTransitionsSince("Delivered", todayStart),
    db.invoice.count({ where: { status: "Out For Delivery" } }),
    db.invoice.count({ where: { status: "Returned To Hub" } }),
    db.invoice.findMany({
      where: {
        status: { in: ["Out For Delivery", "Delivered"] },
        updatedAt: { gte: todayStart },
        deliveryDriver: { not: null },
      },
      select: { deliveryDriver: true },
      distinct: ["deliveryDriver"],
    }),
    db.invoice.findMany({
      where: {
        status: { in: ["Out For Delivery", "Delivered", "Returned To Hub"] },
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: {
        invoiceNumber: true,
        status: true,
        deliveryDriver: true,
        updatedAt: true,
      },
    }),
    statusTransitionTrend("Delivered"),
  ]);

  const countByContainerStatus = new Map<string, number>(
    containerGroups.map((g) => [g.status ?? "UNSET", g._count._all])
  );

  return {
    scope: "destination_admin",
    containers: {
      arrived: countByContainerStatus.get("Arrived") ?? 0,
      cleared: countByContainerStatus.get("Cleared") ?? 0,
      receivedAtHub: countByContainerStatus.get("Received_At_Hub") ?? 0,
    },
    deliveries: {
      deliveredToday,
      outForDelivery,
      returnedToHub,
      trend: deliveredTrend,
    },
    activeDrivers: activeDriverRows.length,
    recentDeliveries: recentDeliveries.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      status: r.status,
      deliveryDriver: r.deliveryDriver,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}