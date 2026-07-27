import "server-only";
import { db } from "@/app/lib/db";

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

/*
 * Two explicit sets of scoped helpers (pickup / delivery) rather than one
 * generic function taking a column name as a parameter. Prisma's tagged
 * template $queryRaw safely parameterizes *values*, but column/identifier
 * names can't go through the same path — writing two hardcoded-column
 * functions avoids ever needing raw SQL identifier interpolation, even
 * though the column choice here isn't user input.
 */

async function pickupStatusTransitionTrend(status: string, staffId: string): Promise<Trend> {
  const twoWeeksAgo = daysAgo(14);
  const oneWeekAgo = daysAgo(7);

  const [seriesRows, deltaRows] = await Promise.all([
    db.$queryRaw<{ day: Date; total: unknown }[]>`
      SELECT DATE(sh.createdAt) AS day, COUNT(*) AS total
      FROM statushistory sh
      JOIN invoices i ON i.id = sh.invoiceId
      WHERE sh.status = ${status}
        AND sh.createdAt >= ${twoWeeksAgo}
        AND i.pickupDriver = ${staffId}
      GROUP BY DATE(sh.createdAt)
      ORDER BY day ASC
    `,
    db.$queryRaw<{ thisWeek: unknown; lastWeek: unknown }[]>`
      SELECT
        SUM(CASE WHEN sh.createdAt >= ${oneWeekAgo} THEN 1 ELSE 0 END) AS thisWeek,
        SUM(CASE WHEN sh.createdAt >= ${twoWeeksAgo} AND sh.createdAt < ${oneWeekAgo} THEN 1 ELSE 0 END) AS lastWeek
      FROM statushistory sh
      JOIN invoices i ON i.id = sh.invoiceId
      WHERE sh.status = ${status}
        AND sh.createdAt >= ${twoWeeksAgo}
        AND i.pickupDriver = ${staffId}
    `,
  ]);

  return {
    series: fillSeries(seriesRows, twoWeeksAgo, 14),
    weekOverWeekPct: deltaRows[0]
      ? deltaPct(deltaRows[0].thisWeek, deltaRows[0].lastWeek)
      : null,
  };
}

async function deliveryStatusTransitionTrend(status: string, staffId: string): Promise<Trend> {
  const twoWeeksAgo = daysAgo(14);
  const oneWeekAgo = daysAgo(7);

  const [seriesRows, deltaRows] = await Promise.all([
    db.$queryRaw<{ day: Date; total: unknown }[]>`
      SELECT DATE(sh.createdAt) AS day, COUNT(*) AS total
      FROM statushistory sh
      JOIN invoices i ON i.id = sh.invoiceId
      WHERE sh.status = ${status}
        AND sh.createdAt >= ${twoWeeksAgo}
        AND i.deliveryDriver = ${staffId}
      GROUP BY DATE(sh.createdAt)
      ORDER BY day ASC
    `,
    db.$queryRaw<{ thisWeek: unknown; lastWeek: unknown }[]>`
      SELECT
        SUM(CASE WHEN sh.createdAt >= ${oneWeekAgo} THEN 1 ELSE 0 END) AS thisWeek,
        SUM(CASE WHEN sh.createdAt >= ${twoWeeksAgo} AND sh.createdAt < ${oneWeekAgo} THEN 1 ELSE 0 END) AS lastWeek
      FROM statushistory sh
      JOIN invoices i ON i.id = sh.invoiceId
      WHERE sh.status = ${status}
        AND sh.createdAt >= ${twoWeeksAgo}
        AND i.deliveryDriver = ${staffId}
    `,
  ]);

  return {
    series: fillSeries(seriesRows, twoWeeksAgo, 14),
    weekOverWeekPct: deltaRows[0]
      ? deltaPct(deltaRows[0].thisWeek, deltaRows[0].lastWeek)
      : null,
  };
}

async function countPickupStatusTransitionsSince(
  status: string,
  since: Date,
  staffId: string
): Promise<number> {
  const rows = await db.$queryRaw<{ total: unknown }[]>`
    SELECT COUNT(*) AS total
    FROM statushistory sh
    JOIN invoices i ON i.id = sh.invoiceId
    WHERE sh.status = ${status}
      AND sh.createdAt >= ${since}
      AND i.pickupDriver = ${staffId}
  `;
  return toNumber(rows[0]?.total);
}

async function countDeliveryStatusTransitionsSince(
  status: string,
  since: Date,
  staffId: string
): Promise<number> {
  const rows = await db.$queryRaw<{ total: unknown }[]>`
    SELECT COUNT(*) AS total
    FROM statushistory sh
    JOIN invoices i ON i.id = sh.invoiceId
    WHERE sh.status = ${status}
      AND sh.createdAt >= ${since}
      AND i.deliveryDriver = ${staffId}
  `;
  return toNumber(rows[0]?.total);
}

/* ---------------------------------- Types ------------------------------------ */

export interface OriginDriverMetrics {
  scope: "o_driver";
  pendingPickup: number;
  collectedToday: number;
  receivedAtOrigin: number;
  totalAssigned: number;
  totalDelivered: number;
  deliveredThisMonth: number;
  trend: Trend;
  stops: {
    invoiceNumber: string;
    status: string;
    pickupCity: string | null;
    pickupStreet: string | null;
    updatedAt: string;
  }[];
}

export interface DestinationDriverMetrics {
  scope: "d_driver";
  outForDelivery: number;
  deliveredToday: number;
  returnedToHub: number;
  totalAssigned: number;
  totalDelivered: number;
  deliveredThisMonth: number;
  trend: Trend;
  stops: {
    invoiceNumber: string;
    status: string;
    destinationCity: string;
    updatedAt: string;
  }[];
}

/* ------------------------------- Query functions ------------------------------ */

/**
 * Every where-clause here includes `pickupDriver: staffId` — this function
 * must never be called without a real, session-derived staffId (enforced
 * by requireDriverAccess before this is reached).
 */
export async function getOriginDriverMetrics(staffId: string): Promise<OriginDriverMetrics> {
  const todayStart = startOfToday();
  const monthStart = startOfMonth();

  const [
    pendingPickup,
    collectedToday,
    receivedAtOrigin,
    totalAssigned,
    totalDelivered,
    deliveredThisMonth,
    trend,
    stops,
  ] = await Promise.all([
    db.invoice.count({
      where: { status: "Pending Pickup", pickupDriver: staffId },
    }),
    countPickupStatusTransitionsSince("Collected", todayStart, staffId),
    db.invoice.count({
      where: { status: "Received At Origin", pickupDriver: staffId },
    }),
    // Lifetime total, any status — every invoice ever linked to this
    // driver's pickupDriver field, not just ones currently in progress.
    db.invoice.count({
      where: { pickupDriver: staffId },
    }),
    // Lifetime total — invoices this driver picked up that have gone all
    // the way through to delivery. Terminal status, so a current-status
    // count is equivalent to (and cheaper than) a statushistory scan.
    db.invoice.count({
      where: { status: "Delivered", pickupDriver: staffId },
    }),
    countPickupStatusTransitionsSince("Delivered", monthStart, staffId),
    pickupStatusTransitionTrend("Collected", staffId),
    db.invoice.findMany({
      where: {
        pickupDriver: staffId,
        status: { in: ["Pending Pickup", "Collected", "Received At Origin"] },
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: {
        invoiceNumber: true,
        status: true,
        pickupCity: true,
        pickupStreet: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    scope: "o_driver",
    pendingPickup,
    collectedToday,
    receivedAtOrigin,
    totalAssigned,
    totalDelivered,
    deliveredThisMonth,
    trend,
    stops: stops.map((s) => ({
      invoiceNumber: s.invoiceNumber,
      status: s.status,
      pickupCity: s.pickupCity,
      pickupStreet: s.pickupStreet,
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}

/**
 * Every where-clause here includes `deliveryDriver: staffId` — same rule
 * as above, this must only ever run with a session-derived staffId.
 */
export async function getDestinationDriverMetrics(
  staffId: string
): Promise<DestinationDriverMetrics> {
  const todayStart = startOfToday();
  const monthStart = startOfMonth();

  const [
    outForDelivery,
    deliveredToday,
    returnedToHub,
    totalAssigned,
    totalDelivered,
    deliveredThisMonth,
    trend,
    stops,
  ] = await Promise.all([
    db.invoice.count({
      where: { status: "Out For Delivery", deliveryDriver: staffId },
    }),
    countDeliveryStatusTransitionsSince("Delivered", todayStart, staffId),
    db.invoice.count({
      where: { status: "Returned To Hub", deliveryDriver: staffId },
    }),
    // Lifetime total, any status — every invoice ever linked to this
    // driver's deliveryDriver field.
    db.invoice.count({
      where: { deliveryDriver: staffId },
    }),
    db.invoice.count({
      where: { status: "Delivered", deliveryDriver: staffId },
    }),
    countDeliveryStatusTransitionsSince("Delivered", monthStart, staffId),
    deliveryStatusTransitionTrend("Delivered", staffId),
    db.invoice.findMany({
      where: {
        deliveryDriver: staffId,
        status: { in: ["Out For Delivery", "Delivered", "Returned To Hub"] },
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
      select: {
        invoiceNumber: true,
        status: true,
        destinationCity: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    scope: "d_driver",
    outForDelivery,
    deliveredToday,
    returnedToHub,
    totalAssigned,
    totalDelivered,
    deliveredThisMonth,
    trend,
    stops: stops.map((s) => ({
      invoiceNumber: s.invoiceNumber,
      status: s.status,
      destinationCity: s.destinationCity,
      updatedAt: s.updatedAt.toISOString(),
    })),
  };
}