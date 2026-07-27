import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const invoiceNumber = req.nextUrl.searchParams.get("invoiceNumber")?.trim();
  if (!invoiceNumber || invoiceNumber.length > 20) {
    return NextResponse.json({ error: "Invalid invoice number." }, { status: 400 });
  }

  const invoice = await db.invoice.findUnique({
    where: { invoiceNumber },
    select: {
      invoiceNumber: true,
      customerCode: true,
      consignerName: true,
      consignerEmail: true,
      amountDue: true,
      amountPaid: true,
      status: true,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "No invoice found with that number." }, { status: 404 });
  }

  return NextResponse.json({
    status: "success",
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      customerCode: invoice.customerCode ?? "GUEST",
      consignerName: invoice.consignerName,
      consignerEmail: invoice.consignerEmail,
      amountDue: toNumber(invoice.amountDue),
      amountPaid: toNumber(invoice.amountPaid),
      status: invoice.status,
    },
  });
}