import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";
import ReportingClient from "./ReportingClient";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  if (session.role !== "super_admin") {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const defaults = defaultRange();
  const from = params.from || defaults.from;
  const to = params.to || defaults.to;

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59.999`);

  const [
    revenueAgg,
    deliveredCount,
    containersOpenedCount,
    destinationGroups,
    statusGroups,
  ] = await Promise.all([
    db.invoice.aggregate({
      _sum: { amountPaid: true, amountDue: true },
      where: { createdAt: { gte: fromDate, lte: toDate } },
    }),
    // StatusHistory, not the invoice's current status — an invoice
    // delivered inside this range should count even if something else
    // happened to it afterward. Same reasoning as the dashboard metrics.
    db.statusHistory.count({
      where: {
        status: "Delivered",
        createdAt: { gte: fromDate, lte: toDate },
      },
    }),
    db.container.count({
      where: { createdAt: { gte: fromDate, lte: toDate } },
    }),
    db.invoice.groupBy({
      by: ["destinationCity"],
      _count: { _all: true },
      where: { createdAt: { gte: fromDate, lte: toDate } },
      orderBy: { _count: { destinationCity: "desc" } },
      take: 8,
    }),
    db.invoice.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { createdAt: { gte: fromDate, lte: toDate } },
    }),
  ]);

  const data = {
    range: { from, to },
    revenue: {
      collected: toNumber(revenueAgg._sum.amountPaid),
      billed: toNumber(revenueAgg._sum.amountDue),
    },
    deliveredCount,
    containersOpenedCount,
    topDestinations: destinationGroups.map((g) => ({
      city: g.destinationCity,
      count: g._count._all,
    })),
    statusBreakdown: statusGroups
      .map((g) => ({ status: g.status, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
  };

  return <ReportingClient data={data} />;
}
