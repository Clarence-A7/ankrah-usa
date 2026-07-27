import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const recent = await db.payments.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const data = recent.map((p) => ({
    id: p.id,
    invoiceNumber: p.invoiceNumber,
    consignerName: p.consignerName,
    amount: Number(p.amount),
    paymentType: p.paymentType,
    createdAt: p.createdAt.toISOString(),
    hasPdf: Boolean(p.pdfFilename),
  }));

  return NextResponse.json({ status: "success", data });
}