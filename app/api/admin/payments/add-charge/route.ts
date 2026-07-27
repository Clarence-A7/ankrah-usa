import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/app/lib/session";
import { db } from "@/app/lib/db";

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "super_admin" && session.role !== "origin_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: { invoiceNumber?: string; description?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const invoiceNumber = (body.invoiceNumber || "").trim();
  const description = (body.description || "").trim();
  const amount = Number(body.amount);

  if (!invoiceNumber || invoiceNumber.length > 20) {
    return NextResponse.json({ error: "Invalid invoice number." }, { status: 400 });
  }
  if (!description || description.length > 255) {
    return NextResponse.json(
      { error: "Description is required and must be under 255 characters." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return NextResponse.json(
      { error: "Amount must be greater than $0 and no more than $100,000." },
      { status: 422 }
    );
  }
  const roundedAmount = Math.round(amount * 100) / 100;

  const invoice = await db.invoice.findUnique({
    where: { invoiceNumber },
    select: { id: true, invoiceNumber: true, amountDue: true, amountPaid: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "No invoice found with that number." }, { status: 404 });
  }

  const newAmountDue = Math.round((toNumber(invoice.amountDue) + roundedAmount) * 100) / 100;
  const chargeItemId = randomUUID();
  const auditId = randomUUID();

  try {
    await db.$transaction([
      // Line item so this charge appears itemized on the next generated
      // invoice PDF, exactly like any other manifest item.
      db.manifestItem.create({
        data: {
          id: chargeItemId,
          itemType: `Additional Charge: ${description}`,
          quantity: 1,
          unitPrice: roundedAmount,
          invoiceId: invoice.id,
        },
      }),
      // Audit trail — who added this and when. Model is named admin_charges
      // (snake_case, no @@map rename), so the Prisma client accessor is
      // db.admin_charges, not a camelCased db.adminCharge.
      db.admin_charges.create({
        data: {
          id: auditId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          description,
          amount: roundedAmount,
          addedByAdminId: session.userId,
        },
      }),
      db.invoice.update({
        where: { id: invoice.id },
        data: { amountDue: newAmountDue },
      }),
    ]);

    return NextResponse.json({
      status: "success",
      invoiceNumber: invoice.invoiceNumber,
      amountDue: newAmountDue,
      amountPaid: toNumber(invoice.amountPaid),
    });
  } catch (err) {
    console.error("Failed to add admin charge:", err);
    return NextResponse.json({ error: "Failed to add charge." }, { status: 500 });
  }
}