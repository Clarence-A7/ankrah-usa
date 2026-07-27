import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";
import PaymentsClient from "./PaymentsClient";

const PAGE_SIZE = 25;

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    redirect("/unauthorized");
  }

  // Mark payments as "seen" the moment this page is opened, so the
  // sidebar badge clears. Fire-and-forget-safe: even if this write fails,
  // the page itself must still render, so it's wrapped and swallowed
  // rather than blocking or crashing the page load.
  db.user
    .update({
      where: { id: session.userId },
      data: { paymentsLastViewedAt: new Date() },
    })
    .catch((err) => {
      console.error("Failed to update paymentsLastViewedAt:", err);
    });

  const params = await searchParams;
  const query = (params.q || "").trim();
  const typeFilter = params.type || "";
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1);

  const where: Record<string, unknown> = {};
  if (query) {
    where.OR = [
      { invoiceNumber: { contains: query } },
      { consignerName: { contains: query } },
      { customerCode: { contains: query } },
    ];
  }
  if (
    typeFilter === "booking_deposit" ||
    typeFilter === "booking_full" ||
    typeFilter === "balance" ||
    typeFilter === "vehicle"
  ) {
    where.paymentType = typeFilter;
  }

  const [totalCount, payments, totals] = await Promise.all([
    db.payments.count({ where }),
    db.payments.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.payments.aggregate({
      _sum: { amount: true },
      where,
    }),
  ]);

  const data = payments.map((p) => ({
    id: p.id,
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoiceNumber,
    customerCode: p.customerCode,
    consignerName: p.consignerName,
    amount: toNumber(p.amount),
    paymentType: p.paymentType,
    stripeSessionId: p.stripeSessionId,
    hasPdf: Boolean(p.pdfFilename),
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <PaymentsClient
      payments={data}
      totalCount={totalCount}
      totalAmount={toNumber(totals._sum.amount)}
      page={page}
      pageSize={PAGE_SIZE}
      query={query}
      typeFilter={typeFilter}
    />
  );
}
